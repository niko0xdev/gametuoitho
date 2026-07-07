// worker/src/routes/matchmaking.ts
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Bindings } from '../db';
import { createDb } from '../db';
import { matchesTable } from '../schema';
import { requireLoggedIn } from '../lib/auth';

export const matchmakingRoute = new Hono<{ Bindings: Bindings }>();

matchmakingRoute.post('/matchmaking/join', requireLoggedIn(), async (c) => {
  const userId = c.get('userId');
  const { gameId } = await c.req.json();
  if (!gameId) return c.json({ error: 'Missing gameId' }, 400);

  // Delegated to the per-game Durable Object: pairing is atomic and works
  // across isolates. On a match, the DO inserts the D1 row and pushes
  // 'matched' to the waiting opponent's WebSocket.
  const stub = c.env.MATCHMAKING_DO.get(c.env.MATCHMAKING_DO.idFromName('queue:' + gameId));
  const result = await stub.join(userId, gameId);
  return c.json(result);
});

matchmakingRoute.post('/matchmaking/leave', requireLoggedIn(), async (c) => {
  const userId = c.get('userId');
  const { gameId } = await c.req.json();
  if (gameId) {
    const stub = c.env.MATCHMAKING_DO.get(c.env.MATCHMAKING_DO.idFromName('queue:' + gameId));
    await stub.leave(userId);
  }
  return c.json({ success: true });
});

matchmakingRoute.post('/private-room', requireLoggedIn(), async (c) => {
  const userId = c.get('userId');
  const { gameId } = await c.req.json();
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const db = createDb(c.env);
  const id = 'pr_' + Date.now();
  await db.insert(matchesTable).values({
    id, gameId, status: 'WAITING',
    players: JSON.stringify([userId]),
    turn: userId, moves: '[]', viewers: '[]',
    createdAt: Date.now(), updatedAt: Date.now(), privateCode: code,
  } as any);
  return c.json({ code, matchId: id });
});

matchmakingRoute.post('/private-room/join', requireLoggedIn(), async (c) => {
  const userId = c.get('userId');
  const { code } = await c.req.json();
  const db = createDb(c.env);
  const all = await db.select().from(matchesTable).all();
  const m = all.find((x: any) => x.privateCode === code);
  if (!m) return c.json({ error: 'Không tìm thấy phòng!' }, 404);
  if ((m as any).status !== 'WAITING') return c.json({ error: 'Phòng đã đầy!' }, 400);
  await db.update(matchesTable).set({
    players: JSON.stringify([JSON.parse((m as any).players)[0], userId]),
    status: 'PLAYING',
    updatedAt: Date.now(),
  } as any).where(eq(matchesTable.id, (m as any).id));
  return c.json({ matchId: (m as any).id });
});

matchmakingRoute.post('/match/invite', requireLoggedIn(), async (c) => {
  const fromUserId = c.get('userId');
  const { targetUserId, gameId, code } = await c.req.json();
  if (gameId) {
    const stub = c.env.MATCHMAKING_DO.get(c.env.MATCHMAKING_DO.idFromName('queue:' + gameId));
    await stub.pushInvite(targetUserId, fromUserId, gameId, code);
  }
  return c.json({ success: true });
});

// WebSocket upgrade for the matchmaking queue. The per-game Durable Object owns
// each waiting user's socket and pushes 'matched' / 'invitation'. Authentication
// via query param (WS can't set custom headers); same trade-off as the old SSE
// stream — mitigate with short-lived JWTs in production.
matchmakingRoute.get('/matchmaking/ws', async (c) => {
  const userId = c.req.query('userId');
  const gameId = c.req.query('gameId');
  if (!userId || !gameId) return c.json({ error: 'Missing userId/gameId' }, 400);

  const u = await c.env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
  if (!u) return c.json({ error: 'Unknown user' }, 401);

  const id = c.env.MATCHMAKING_DO.idFromName('queue:' + gameId);
  return c.env.MATCHMAKING_DO.get(id).fetch(c.req.raw);
});
