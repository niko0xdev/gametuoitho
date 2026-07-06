// worker/src/routes/leaderboard.ts
import { Hono } from 'hono';
import type { Bindings } from '../db';
import { createDb } from '../db';
import { profilesTable } from '../schema';

const GAME_KEYS: Record<string, string> = {
  caro: 'eloCaro',
  co_tuong: 'eloCoTuong',
  co_vua: 'eloCoVua',
  o_an_quan: 'eloOAnQuan',
  co_ca_ngua: 'eloCoCaNgua',
  duoi_hinh_bat_chu: 'eloDuoiHinhBatChu',
  noi_chu: 'eloNoiChu',
  doan_tu: 'eloDoanTu',
};

export const leaderboardRoute = new Hono<{ Bindings: Bindings }>();

leaderboardRoute.get('/global', async (c) => {
  const db = createDb(c.env);
  const all = await db.select().from(profilesTable).all();
  return c.json(all.sort((a, b) => b.honorScore - a.honorScore).slice(0, 50));
});

leaderboardRoute.get('/:gameId', async (c) => {
  const gameId = c.req.param('gameId');
  const key = GAME_KEYS[gameId];
  if (!key) return c.json({ error: 'Unknown game' }, 400);
  const db = createDb(c.env);
  const all = await db.select().from(profilesTable).all();
  const out = all.map((p: any) => ({
    id: p.id,
    displayName: p.displayName,
    avatar: p.avatar,
    elo: p[key] ?? 1500,
    honorScore: p.honorScore,
  })).sort((a, b) => b.elo - a.elo).slice(0, 50);
  return c.json(out);
});
