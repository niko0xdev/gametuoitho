// worker/src/routes/leagues.ts
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Bindings } from '../db';
import { createDb } from '../db';
import { myLeaguesTable, leaguePermissionsTable } from '../schema';

export const leaguesRoute = new Hono<{ Bindings: Bindings }>();

async function getPermissions(db: ReturnType<typeof createDb>) {
  const rows = await db.select().from(leaguePermissionsTable).all();
  const map: Record<string, boolean> = {};
  for (const r of rows) map[(r as any).userId] = !!((r as any).canEdit);
  return map;
}

leaguesRoute.get('/leagues', async (c) => {
  const userId = c.req.query('userId');
  const db = createDb(c.env);
  if (userId) {
    const perms = await getPermissions(db);
    if (!perms[userId]) return c.json({ error: 'Quyền truy cập bị hạn chế' }, 403);
  }
  return c.json(await db.select().from(myLeaguesTable).all());
});

leaguesRoute.post('/leagues', async (c) => {
  const league = await c.req.json();
  if (!league?.id || !league?.name) return c.json({ error: 'Dữ liệu giải đấu không hợp lệ!' }, 400);
  const db = createDb(c.env);
  await db.insert(myLeaguesTable).values(league as any).onConflictDoUpdate({ target: myLeaguesTable.id, set: league as any });
  return c.json(league);
});

leaguesRoute.put('/leagues/:id', async (c) => {
  const league = await c.req.json();
  if (!league?.id || !league?.name) return c.json({ error: 'Dữ liệu giải đấu không hợp lệ!' }, 400);
  const db = createDb(c.env);
  await db.insert(myLeaguesTable).values(league as any).onConflictDoUpdate({ target: myLeaguesTable.id, set: league as any });
  return c.json(league);
});

leaguesRoute.delete('/leagues/:id', async (c) => {
  const db = createDb(c.env);
  await db.delete(myLeaguesTable).where(eq(myLeaguesTable.id, c.req.param('id')));
  return c.json({ success: true });
});

leaguesRoute.get('/leagues-permissions', async (c) => {
  const db = createDb(c.env);
  return c.json({ permissions: await getPermissions(db) });
});

leaguesRoute.post('/leagues-permissions/toggle', async (c) => {
  const { targetUserId } = await c.req.json();
  if (!targetUserId) return c.json({ error: 'Thiếu mã tài khoản!' }, 400);
  const db = createDb(c.env);
  const rows = await db.select().from(leaguePermissionsTable).where(eq(leaguePermissionsTable.userId, targetUserId)).all();
  const current = !!rows[0] && !!(rows[0] as any).canEdit;
  if (rows[0]) {
    await db.update(leaguePermissionsTable).set({ canEdit: current ? 0 : 1 } as any).where(eq(leaguePermissionsTable.userId, targetUserId));
  } else {
    await db.insert(leaguePermissionsTable).values({ userId: targetUserId, canEdit: 1 } as any);
  }
  return c.json({ success: true, permissions: await getPermissions(db) });
});
