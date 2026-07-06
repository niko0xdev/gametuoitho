// worker/src/routes/tournaments.ts
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Bindings } from '../db';
import { createDb } from '../db';
import { tournamentsTable, matchesTable } from '../schema';

export const tournamentsRoute = new Hono<{ Bindings: Bindings }>();

tournamentsRoute.get('/', async (c) => {
  const db = createDb(c.env);
  return c.json(await db.select().from(tournamentsTable).all());
});

tournamentsRoute.post('/create', async (c) => {
  const { userId, name, gameId, maxPlayers, deadlineSeconds } = await c.req.json();
  const id = 'tour_' + Date.now();
  const tournament = {
    id,
    name,
    gameId,
    organizer: userId,
    status: 'OPEN',
    players: JSON.stringify([userId]),
    maxPlayers: parseInt(maxPlayers) || 16,
    deadline: parseInt(deadlineSeconds) || 300,
    schedule: '[]',
    standings: '{}',
    createdAt: Date.now(),
  };
  const db = createDb(c.env);
  await db.insert(tournamentsTable).values(tournament as any);
  return c.json(tournament);
});

tournamentsRoute.post('/join', async (c) => {
  const { userId, code } = await c.req.json();
  const db = createDb(c.env);
  // Legacy: `code` is treated as tournament id.
  const rows = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, code)).all();
  const t = rows[0];
  if (!t) return c.json({ error: 'Không thể tham gia giải đấu! Mã không hợp lệ.' }, 400);
  const players: string[] = JSON.parse((t as any).players || '[]');
  if (players.length >= (t as any).maxPlayers) return c.json({ error: 'Giải đấu đã đầy!' }, 400);
  if (!players.includes(userId)) players.push(userId);
  await db.update(tournamentsTable).set({ players: JSON.stringify(players) } as any).where(eq(tournamentsTable.id, t.id));
  return c.json({ ...t, players });
});

tournamentsRoute.get('/code/:code', async (c) => {
  const db = createDb(c.env);
  const rows = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, c.req.param('code'))).all();
  if (!rows[0]) return c.json({ error: 'Không tìm thấy giải đấu!' }, 404);
  return c.json(rows[0]);
});

tournamentsRoute.get('/:id', async (c) => {
  const db = createDb(c.env);
  const rows = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, c.req.param('id'))).all();
  if (!rows[0]) return c.json({ error: 'Không tìm thấy giải đấu!' }, 404);
  return c.json(rows[0]);
});

tournamentsRoute.post('/:id/start', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');
  await db.update(tournamentsTable).set({ status: 'RUNNING' } as any).where(eq(tournamentsTable.id, id));
  const rows = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, id)).all();
  return c.json(rows[0]);
});

tournamentsRoute.post('/:id/launch/:matchIndex', async (c) => {
  const matchId = 'match_' + Date.now();
  const db = createDb(c.env);
  await db.insert(matchesTable).values({
    id: matchId, gameId: 'tournament', status: 'PLAYING',
    players: '[]', turn: 'p1', moves: '[]', viewers: '[]',
    createdAt: Date.now(),
  } as any);
  return c.json({ matchId });
});
