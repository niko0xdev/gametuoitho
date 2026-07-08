// worker/src/do/gameserver.ts
import { DurableObject } from 'cloudflare:workers';
import type { Bindings } from '../db';

type Attachment = { userId: string | null };

// Single global Durable Object backing the legacy WS game/lobby protocol that
// GameBoard.tsx + App.tsx speak. Faithful port target of server/roomManager.ts.
//
// Step 2 scope: socket registration (REGISTER_SOCKET) + presence
// (ONLINE_USERS / getOnlineUsers RPC) + private-room invitations
// (SEND_INVITATION). Matchmaking, moves, spectators arrive in later steps;
// their message types are ignored here for now.
export class GameServerDO extends DurableObject<Bindings> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ userId: null } satisfies Attachment);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer): Promise<void> {
    let data: any;
    try {
      data = JSON.parse(typeof msg === 'string' ? msg : new TextDecoder().decode(msg));
    } catch {
      return; // ignore malformed frames
    }
    const type = data?.type;
    const payload = data?.payload ?? {};
    const att = (ws.deserializeAttachment() as Attachment | undefined) ?? { userId: null };

    if (type === 'REGISTER_SOCKET') {
      const userId = payload.userId;
      if (!userId) return;
      ws.serializeAttachment({ userId } satisfies Attachment);
      ws.send(JSON.stringify({ type: 'REGISTERED', payload: { success: true } }));
      this.broadcastOnlineUsers();
      return;
    }

    // Everything below requires a registered socket.
    if (!att.userId) return;

    if (type === 'SEND_INVITATION') {
      const target = this.findSocket(payload.targetUserId);
      if (!target) return;
      // Resolve sender display name; tolerate D1 hiccups by falling back to userId.
      let fromUserName: string = att.userId;
      try {
        const row = await this.env.DB.prepare('SELECT displayName FROM users WHERE id = ?').bind(att.userId).first();
        if (row?.displayName) fromUserName = row.displayName as string;
      } catch {
        // keep fallback
      }
      target.send(JSON.stringify({
        type: 'PRIVATE_ROOM_INVITATION',
        payload: {
          fromUserId: att.userId,
          fromUserName,
          gameId: payload.gameId,
          code: payload.code,
        },
      }));
      return;
    }
    // JOIN_MATCHMAKING / MAKE_MOVE / SPECTATE_MATCH / private-room ops: later steps.
  }

  async webSocketClose(): Promise<void> {
    this.broadcastOnlineUsers();
  }
  async webSocketError(ws: WebSocket): Promise<void> {
    try { ws.close(); } catch { /* gone */ }
  }

  // RPC for HTTP GET /api/online-users.
  async getOnlineUsers(): Promise<string[]> {
    const users: string[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | undefined;
      if (att?.userId) users.push(att.userId);
    }
    return users;
  }

  private findSocket(userId: string): WebSocket | undefined {
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | undefined;
      if (att?.userId === userId) return ws;
    }
    return undefined;
  }

  private broadcastOnlineUsers(): void {
    const users: string[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | undefined;
      if (att?.userId) users.push(att.userId);
    }
    const msg = JSON.stringify({ type: 'ONLINE_USERS', payload: { users } });
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(msg); } catch { /* gone */ }
    }
  }
}
