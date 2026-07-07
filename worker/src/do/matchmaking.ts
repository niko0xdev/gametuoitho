// worker/src/do/matchmaking.ts
import { DurableObject } from 'cloudflare:workers';
import type { Bindings } from '../db';
import { createDb } from '../db';
import { matchesTable } from '../schema';
import { wsMessage } from '../lib/ws';

type Attachment = { userId: string; gameId: string; matched: boolean };

// One Durable Object per game. Membership in the waiting queue == having an
// open matchmaking WebSocket, which the runtime preserves across DO eviction
// (along with each socket's attachment). Pairing is triggered on every new WS
// connect, so it works regardless of which isolate handled the connect and
// survives the DO being evicted while a user waits — the core fix.
export class MatchmakingDO extends DurableObject<Bindings> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const gameId = url.searchParams.get('gameId');
    if (!userId || !gameId) return new Response('Missing userId/gameId', { status: 400 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ userId, gameId, matched: false } satisfies Attachment);
    this.ctx.acceptWebSocket(server);

    // Try to pair this connection with someone already waiting.
    await this.tryPair(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // Find an unmatched, different-user waiting socket and pair with it. The DO
  // serializes fetch handlers per instance, so concurrent connects are ordered.
  private async tryPair(ws: WebSocket): Promise<void> {
    const mine = ws.deserializeAttachment() as Attachment | undefined;
    if (!mine || mine.matched) return;

    for (const other of this.ctx.getWebSockets()) {
      if (other === ws) continue;
      const theirs = other.deserializeAttachment() as Attachment | undefined;
      if (!theirs || theirs.matched || theirs.userId === mine.userId) continue;

      const matchId = 'match_' + Date.now();
      // Persist first: if this throws, neither user is marked matched, so the
      // waiting user stays waitable and the joiner's upgrade fails (reconnect).
      const db = createDb(this.env);
      await db.insert(matchesTable).values({
        id: matchId,
        gameId: mine.gameId,
        status: 'PLAYING',
        // Initiator (this socket) is players[0] and moves first — matches the
        // pre-DO route's [userId, opponentId] / turn:userId convention.
        players: JSON.stringify([mine.userId, theirs.userId]),
        turn: mine.userId,
        moves: '[]',
        viewers: '[]',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as any);

      mine.matched = true;
      ws.serializeAttachment(mine);
      theirs.matched = true;
      other.serializeAttachment(theirs);

      ws.send(wsMessage('matched', { matchId, opponentId: theirs.userId }));
      other.send(wsMessage('matched', { matchId, opponentId: mine.userId }));
      return;
    }
  }

  // RPC: POST /match/invite — push an invite to a connected target user.
  async pushInvite(
    targetUserId: string,
    fromUserId: string,
    gameId: string,
    code: string,
  ): Promise<void> {
    const msg = wsMessage('invitation', { fromUserId, gameId, code });
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | undefined;
      if (att?.userId === targetUserId) {
        try {
          ws.send(msg);
        } catch {
          // gone
        }
      }
    }
  }

  async webSocketClose(): Promise<void> {
    // Membership is derived from live sockets, so nothing to clean up here.
  }
  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close();
    } catch {
      // already closed
    }
  }
}
