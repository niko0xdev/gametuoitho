// worker/src/do/match.ts
import { DurableObject } from 'cloudflare:workers';
import type { Bindings } from '../db';
import { wsMessage } from '../lib/ws';

// One Durable Object per match. Acts as a hibernatable WebSocket pub/sub hub:
// players/viewers subscribe here and receive 'snapshot' / 'move' / 'ended'
// pushes. Authoritative match state stays in D1 — the Worker writes there on
// each /move and /forfeit, then calls broadcast() to fan the delta out here.
// DO serialization + cross-isolate routing is what fixes the old per-isolate
// in-memory broadcast bug.
export class MatchDO extends DurableObject<Bindings> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    const url = new URL(request.url);
    const matchId = url.searchParams.get('matchId');
    const userId = url.searchParams.get('userId');
    if (!matchId || !userId) return new Response('Missing matchId/userId', { status: 400 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [userId]);

    // Hydrate the client with the current match snapshot on connect, or signal
    // an error and close if the match doesn't exist (restores the old SSE path's
    // explicit not-found behavior instead of hanging the client).
    const row = await this.env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first();
    if (!row) {
      server.send(wsMessage('error', { error: 'Không tìm thấy trận đấu!' }));
      server.close(4000, 'not found');
    } else {
      server.send(
        wsMessage('snapshot', {
          matchId,
          status: row.status,
          players: JSON.parse((row.players as string) || '[]'),
          turn: row.turn,
          moves: JSON.parse((row.moves as string) || '[]'),
          winner: row.winner ?? null,
        }),
      );
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  // RPC entry point: Worker calls this after a D1 write to push the delta to
  // every subscriber of this match.
  broadcast(event: string, data: Record<string, unknown>): void {
    const msg = wsMessage(event, data);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(msg);
      } catch {
        // subscriber gone — skip
      }
    }
  }

  async webSocketMessage(): Promise<void> {
    // Subscribers are read-only; moves arrive via HTTP /match/:id/move.
  }
  async webSocketClose(): Promise<void> {}
  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close();
    } catch {
      // already closed
    }
  }
}
