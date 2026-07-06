// worker/src/routes/challenges.ts
import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import type { Bindings } from '../db';
import { createDb } from '../db';
import { dailyChallengesTable } from '../schema';

export const challengesRoute = new Hono<{ Bindings: Bindings }>();

challengesRoute.get('/:gameId/:date', async (c) => {
  const { gameId, date } = c.req.param();
  const db = createDb(c.env);
  const rows = await db.select().from(dailyChallengesTable)
    .where(and(eq(dailyChallengesTable.gameId, gameId), eq(dailyChallengesTable.date, date)))
    .all();
  if (rows[0]) return c.json(rows[0]);

  const puzzle = {
    id: 'dc_' + Date.now(),
    gameId, date,
    seed: Math.random().toString(36).slice(2),
    prompt: '{}',
    topScores: '[]',
  };
  await db.insert(dailyChallengesTable).values(puzzle as any);
  return c.json(puzzle);
});

challengesRoute.post('/:gameId/:date/submit', async (c) => {
  const { gameId, date } = c.req.param();
  const { userId, displayName, avatar, score } = await c.req.json();
  const db = createDb(c.env);
  const rows = await db.select().from(dailyChallengesTable)
    .where(and(eq(dailyChallengesTable.gameId, gameId), eq(dailyChallengesTable.date, date)))
    .all();
  let ch = rows[0];
  if (!ch) {
    ch = { id: 'dc_' + Date.now(), gameId, date, seed: '', prompt: '{}', topScores: '[]' } as any;
    await db.insert(dailyChallengesTable).values(ch as any);
  }
  const topScores: any[] = JSON.parse((ch as any).topScores || '[]');
  topScores.push({ userId, displayName, avatar, score, ts: Date.now() });
  await db.update(dailyChallengesTable).set({ topScores: JSON.stringify(topScores) } as any).where(eq(dailyChallengesTable.id, ch!.id));
  return c.json({ ...ch, topScores });
});
