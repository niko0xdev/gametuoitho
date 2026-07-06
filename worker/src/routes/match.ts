// worker/src/routes/match.ts
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Bindings } from '../db';
import { createDb } from '../db';
import { matchesTable } from '../schema';
import { sseStream } from '../lib/sse';
import { addMatchStream, broadcastMatch } from '../lib/state';
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

  broadcastMatch(matchId, 'move', { userId, move, ts: moveTs, turn: nextTurn });
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
  broadcastMatch(matchId, 'ended', { winner, reason: 'forfeit' });
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

matchRoute.get('/match/:id/stream', (c) => {
  const matchId = c.req.param('id');
  // D1's prepare(...).all() is synchronous, so we can read snapshot inline.
  const row = c.env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first() as any;
  return sseStream({
    onConnect: (send, close) => {
      if (!row) {
        send('error', { error: 'Match not found' });
        close();
        return;
      }
      send('snapshot', {
        matchId,
        status: row.status,
        players: JSON.parse(row.players || '[]'),
        turn: row.turn,
        moves: JSON.parse(row.moves || '[]'),
        winner: row.winner,
      });
      return addMatchStream(matchId, { send, close });
    },
    heartbeatMs: 30000,
  });
});
