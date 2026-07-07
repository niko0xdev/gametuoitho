// worker/src/do/matchmaking.ts
import { DurableObject } from 'cloudflare:workers';
import type { Bindings } from '../db';
import { createDb } from '../db';
import { matchesTable } from '../schema';
import { wsMessage } from '../lib/ws';

type Attachment = { userId: string };

// One Durable Object per game. Owns the waiting queue and each waiting user's
// WebSocket, so it can push 'matched' / 'invitation'. Because a DO serializes
// all access for its instance, pairing is atomic and race-free across every
// Worker isolate — the core fix for the per-isolate matchmaking bug.
export class MatchmakingDO extends DurableObject<Bindings> {
  private queue = new Set<string>();

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    if (!userId) return new Response('Missing userId', { status: 400 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ userId } satisfies Attachment);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // RPC: called by POST /matchmaking/join. Pair atomically with a waiting
  // opponent, or enqueue and wait.
  async join(
    userId: string,
    gameId: string,
  ): Promise<{ matched: boolean; matchId?: string; opponentId?: string }> {
    for (const id of this.queue) {
      if (id !== userId) {
        this.queue.delete(id);
        const matchId = 'match_' + Date.now();
        const db = createDb(this.env);
        await db.insert(matchesTable).values({
          id: matchId,
          gameId,
          status: 'PLAYING',
          players: JSON.stringify([id, userId]),
          turn: userId,
          moves: '[]',
          viewers: '[]',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as any);
        this.sendToUser(id, 'matched', { matchId, opponentId: userId });
        return { matched: true, matchId, opponentId: id };
      }
    }
    this.queue.add(userId);
    return { matched: false };
  }

  // RPC: POST /matchmaking/leave
  async leave(userId: string): Promise<void> {
    this.queue.delete(userId);
  }

  // RPC: POST /match/invite — push an invite to a connected target user.
  async pushInvite(
    targetUserId: string,
    fromUserId: string,
    gameId: string,
    code: string,
  ): Promise<void> {
    this.sendToUser(targetUserId, 'invitation', { fromUserId, gameId, code });
  }

  private sendToUser(userId: string, event: string, data: Record<string, unknown>): void {
    const msg = wsMessage(event, data);
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | undefined;
      if (att?.userId === userId) {
        try {
          ws.send(msg);
        } catch {
          // gone
        }
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | undefined;
    if (att?.userId) this.queue.delete(att.userId);
  }
  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close();
    } catch {
      // already closed
    }
  }
}
