// worker/src/routes/replays.ts
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Bindings } from '../db';
import { createDb } from '../db';
import { matchesTable } from '../schema';

export const replaysRoute = new Hono<{ Bindings: Bindings }>();

replaysRoute.get('/:userId', async (c) => {
  const userId = c.req.param('userId');
  const db = createDb(c.env);
  const all = await db.select().from(matchesTable).all();
  return c.json(all.filter((m: any) => m.status === 'ENDED' && (m.players || '').includes(userId)));
});

replaysRoute.get('/replay/:matchId', async (c) => {
  const db = createDb(c.env);
  const rows = await db.select().from(matchesTable).where(eq(matchesTable.id, c.req.param('matchId'))).all();
  if (!rows[0]) return c.json({ error: 'Không tìm thấy nhật ký trận đấu!' }, 404);
  return c.json(rows[0]);
});
