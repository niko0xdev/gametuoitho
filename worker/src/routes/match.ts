// worker/src/routes/match.ts
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Bindings } from '../db';
import { createDb } from '../db';
import { matchesTable } from '../schema';
import { requireLoggedIn } from '../lib/auth';

export const matchRoute = new Hono<{ Bindings: Bindings }>();

matchRoute.post('/match/:id/move', requireLoggedIn(), async (c) => {
  const matchId = c.req.param('id');
  const userId = c.get('userId');
  const { move } = await c.req.json();
  const db = createDb(c.env);
  const rows = await db.select().from(matchesTable).where(eq(matchesTable.id, matchId)).all();
  const m = rows[0];
  if (!m) return c.json({ error: 'Không tìm thấy trận đấu!' }, 404);
  const players: string[] = JSON.parse((m as any).players || '[]');
  if (!players.includes(userId)) return c.json({ error: 'Không phải người chơi trong trận!' }, 403);

  const moves: any[] = JSON.parse((m as any).moves || '[]');
  const moveTs = Date.now();
  moves.push({ userId, move, ts: moveTs });
  const nextTurn = players.find((p) => p !== userId) ?? userId;

  await db.update(matchesTable).set({
    moves: JSON.stringify(moves),
    turn: nextTurn,
    updatedAt: Date.now(),
  } as any).where(eq(matchesTable.id, matchId));

  // Fan the move out to all subscribers via the match Durable Object.
  const stub = c.env.MATCH_DO.get(c.env.MATCH_DO.idFromName('match:' + matchId));
  await stub.broadcast('move', { userId, move, ts: moveTs, turn: nextTurn });
  return c.json({ success: true, moveTs, turn: nextTurn });
});

matchRoute.post('/match/:id/forfeit', requireLoggedIn(), async (c) => {
  const matchId = c.req.param('id');
  const userId = c.get('userId');
  const db = createDb(c.env);
  const rows = await db.select().from(matchesTable).where(eq(matchesTable.id, matchId)).all();
  const m = rows[0];
  if (!m) return c.json({ error: 'Không tìm thấy trận đấu!' }, 404);
  const players: string[] = JSON.parse((m as any).players || '[]');
  if (!players.includes(userId)) return c.json({ error: 'Không phải người chơi trong trận!' }, 403);
  const winner = players.find((p) => p !== userId) ?? null;
  await db.update(matchesTable).set({ status: 'ENDED', winner, updatedAt: Date.now() } as any).where(eq(matchesTable.id, matchId));

  const stub = c.env.MATCH_DO.get(c.env.MATCH_DO.idFromName('match:' + matchId));
  await stub.broadcast('ended', { winner, reason: 'forfeit' });
  return c.json({ success: true, winner });
});

matchRoute.get('/match/:id/state', async (c) => {
  const matchId = c.req.param('id');
  const db = createDb(c.env);
  const rows = await db.select().from(matchesTable).where(eq(matchesTable.id, matchId)).all();
  const m = rows[0];
  if (!m) return c.json({ error: 'Không tìm thấy trận đấu!' }, 404);
  return c.json({
    matchId,
    status: (m as any).status,
    players: JSON.parse((m as any).players || '[]'),
    turn: (m as any).turn,
    moves: JSON.parse((m as any).moves || '[]'),
    winner: (m as any).winner,
  });
});

// WebSocket upgrade: forwards the socket to the match's Durable Object, which
// owns the hibernatable subscriber set and pushes snapshot/move/ended events.
matchRoute.get('/match/:id/ws', async (c) => {
  const matchId = c.req.param('id');
  const userId = c.req.query('userId');
  if (!userId) return c.json({ error: 'Missing userId' }, 401);
  // Cheap existence check; same pattern the old SSE stream used.
  const u = await c.env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
  if (!u) return c.json({ error: 'Unknown user' }, 401);

  const id = c.env.MATCH_DO.idFromName('match:' + matchId);
  // Inject matchId into the query so the DO can hydrate the snapshot.
  const url = new URL(c.req.raw.url);
  url.searchParams.set('matchId', matchId);
  return c.env.MATCH_DO.get(id).fetch(new Request(url, c.req.raw));
});
