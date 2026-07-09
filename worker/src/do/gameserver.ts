// worker/src/do/gameserver.ts
import { DurableObject } from 'cloudflare:workers';
import type { Bindings } from '../db';
import {
  type SoloMatch,
  synthesizeSoloMatch,
  applySoloMove,
  generateBotMove,
  BOT_ID,
} from '../game/solo';

type Attachment = { userId: string | null };

// Single global Durable Object backing the legacy WS game/lobby protocol that
// GameBoard.tsx + App.tsx speak. Faithful port of server/roomManager.ts.
//
// Handles: REGISTER_SOCKET + presence, SEND_INVITATION (private-room invites),
// and the SOLO path — `match_solo_<gameId>_<ts>` matches synthesized in memory
// with a local bot (SPECTATE_MATCH / MAKE_MOVE / FORFEIT). Real multiplayer
// lobby matchmaking is not part of this DO (queue lives in MatchmakingDO).
export class GameServerDO extends DurableObject<Bindings> {
  // ponytail: solo matches are kept in DO memory only — they do not persist to
  // D1 and are lost if the global DO evicts. Ceiling: a solo game in progress
  // would reset on eviction. Acceptable for single-player ephemeral matches.
  // Upgrade path: persist to D1 (like legacy db.saveMatch) if replay history is
  // needed.
  private matches = new Map<string, SoloMatch>();
  private spectators = new Map<string, Set<WebSocket>>();

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

    if (type === 'SPECTATE_MATCH') {
      this.handleSpectate(att.userId, payload.matchId, ws);
      return;
    }

    if (type === 'MAKE_MOVE') {
      this.handleMove(att.userId, payload.matchId, payload.move);
      return;
    }

    if (type === 'FORFEIT') {
      this.handleForfeit(att.userId, payload.matchId);
      return;
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.removeSpectatorSocket(ws);
    this.broadcastOnlineUsers();
  }
  async webSocketError(ws: WebSocket): Promise<void> {
    this.removeSpectatorSocket(ws);
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

  // --- Solo match handling ---

  private handleSpectate(userId: string, matchId: string, ws: WebSocket): void {
    if (!matchId) return;
    let match = this.matches.get(matchId);
    if (!match) {
      const fresh = synthesizeSoloMatch(matchId, userId);
      if (!fresh) {
        ws.send(JSON.stringify({ type: 'SPECTATE_FAILED', payload: { error: 'Trò chơi này chưa hỗ trợ chơi đơn!' } }));
        return;
      }
      match = fresh;
      this.matches.set(matchId, match);
    }
    // Register this socket as a spectator (the solo player watches their own match).
    let set = this.spectators.get(matchId);
    if (!set) {
      set = new Set();
      this.spectators.set(matchId, set);
    }
    set.add(ws);
    match.viewers = Array.from(set).map(() => 'Spectator');
    ws.send(JSON.stringify({ type: 'MATCH_STATE_UPDATE', payload: match }));
  }

  private handleMove(userId: string, matchId: string, move: any): void {
    const match = this.matches.get(matchId);
    if (!match) return;
    const res = applySoloMove(match, userId, move);
    if (!res.accepted) {
      const sock = this.findSocket(userId);
      if (sock) sock.send(JSON.stringify({ type: 'MOVE_REJECTED', payload: { error: res.error || 'Nước đi không hợp lệ!' } }));
      return;
    }

    // GameBoard renders the end panel from match.status === 'ENDED', so a state
    // push is enough — no separate MATCH_ENDED message needed.
    this.broadcast(matchId, match);

    if (res.match.status === 'PLAYING') {
      this.maybeScheduleBot(matchId);
    }
  }

  private handleForfeit(userId: string, matchId: string): void {
    const match = this.matches.get(matchId);
    if (!match || match.status !== 'PLAYING') return;
    if (!match.players.includes(userId)) return;
    match.status = 'ENDED';
    match.winner = match.players.find((p) => p !== userId) ?? null;
    match.updatedAt = Date.now();
    this.broadcast(matchId, match);
  }

  // Generate + apply the bot's move, then loop if the bot must act again (e.g.
  // Ludo roll→move). Uses ctx.waitUntil so the DO stays awake across the delay.
  private maybeScheduleBot(matchId: string): void {
    const match = this.matches.get(matchId);
    if (!match || match.status !== 'PLAYING') return;
    if (!generateBotMovePreview(match)) return; // nobody to move
    this.ctx.waitUntil(
      new Promise<void>((resolve) => setTimeout(resolve, 800)).then(() => {
        this.runBotTurn(matchId);
      }).catch((err) => {
        console.error('[solo] bot turn failed', err);
      })
    );
  }

  private runBotTurn(matchId: string): void {
    const match = this.matches.get(matchId);
    if (!match || match.status !== 'PLAYING') return;
    // Nobody watching (player closed the tab) → don't burn CPU playing on.
    const spectators = this.spectators.get(matchId);
    if (!spectators || spectators.size === 0) return;

    const move = generateBotMove(match);
    if (move) {
      const res = applySoloMove(match, BOT_ID, move);
      if (res.accepted) {
        this.broadcast(matchId, match);
        if (res.match.status === 'PLAYING') {
          this.maybeScheduleBot(matchId);
        }
        return;
      }
    }
    // Safety net: bot produced no applicable move (CPU exhausted, no legal
    // move, or no generator). If it's still the bot's turn in a turn-based
    // game, fall the turn back to the human so the arena never deadlocks —
    // the exact "stuck on loading / frozen" symptom this module prevents.
    if (match.turn === BOT_ID) {
      match.turn = match.players.find((p) => p !== BOT_ID) ?? match.turn;
      match.updatedAt = Date.now();
      this.broadcast(matchId, match);
    }
  }

  private broadcast(matchId: string, match: SoloMatch): void {
    const set = this.spectators.get(matchId);
    if (!set) return;
    const msg = JSON.stringify({ type: 'MATCH_STATE_UPDATE', payload: match });
    for (const ws of set) {
      try { ws.send(msg); } catch { /* dropped */ }
    }
  }

  private removeSpectatorSocket(ws: WebSocket): void {
    for (const [matchId, set] of this.spectators) {
      if (set.delete(ws)) {
        const match = this.matches.get(matchId);
        if (match) match.viewers = Array.from(set).map(() => 'Spectator');
        if (set.size === 0) {
          this.spectators.delete(matchId);
          // ponytail: we keep the match around briefly so a reconnect/re-spectate
          // within the DO's lifetime resumes; evicted on DO recycle anyway.
        }
      }
    }
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

// Cheap preview: would the bot move next? Avoids scheduling a timer when there's
// nothing to do. Mirrors the turn/answer checks inside generateBotMove.
function generateBotMovePreview(match: SoloMatch): boolean {
  if (match.status !== 'PLAYING') return false;
  if (match.gameId === 'speed_math') {
    const ans = match.boardState?.answers;
    return !!(ans && ans[BOT_ID] === null);
  }
  return match.turn === BOT_ID;
}
