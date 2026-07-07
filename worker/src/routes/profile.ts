// worker/src/routes/profile.ts
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Bindings } from '../db';
import { createDb } from '../db';
import { profilesTable, usersTable } from '../schema';
import { requireLoggedIn } from '../lib/auth';

const defaultElo = {
  eloCaro: 1500, eloCoTuong: 1500, eloCoVua: 1500, eloOAnQuan: 1500,
  eloCoCaNgua: 1500, eloDuoiHinhBatChu: 1500, eloNoiChu: 1500, eloDoanTu: 1500,
  honorScore: 100, badges: '[]',
};

export const profileRoute = new Hono<{ Bindings: Bindings }>();

async function getOrInitProfile(userId: string, c: any) {
  const db = createDb(c.env);
  const rows = await db.select().from(profilesTable).where(eq(profilesTable.id, userId)).all();
  if (rows[0]) return rows[0];
  const profile = { id: userId, displayName: `Kỳ thủ ${userId.substring(0, 5)}`, avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${userId}`, ...defaultElo };
  await db.insert(profilesTable).values(profile as any);
  return profile;
}

profileRoute.get('/:userId', async (c) => {
  const profile = await getOrInitProfile(c.req.param('userId'), c);
  const db = createDb(c.env);
  const u = await db.select().from(usersTable).where(eq(usersTable.id, c.req.param('userId'))).all();
  return c.json({ ...profile, role: u[0]?.role ?? 'user' });
});

profileRoute.post('/:userId/update', requireLoggedIn(), async (c) => {
  const target = c.req.param('userId');
  if (target !== c.get('userId')) return c.json({ error: 'Không thể sửa profile của người khác!' }, 403);
  const { displayName, avatar } = await c.req.json();
  const profile = await getOrInitProfile(target, c);
  if (displayName) profile.displayName = displayName;
  if (avatar) profile.avatar = avatar;
  const db = createDb(c.env);
  await db.update(profilesTable).set({ displayName: profile.displayName, avatar: profile.avatar }).where(eq(profilesTable.id, profile.id));
  if (displayName || avatar) {
    await db.update(usersTable).set({ displayName: profile.displayName, avatar: profile.avatar }).where(eq(usersTable.id, profile.id));
  }
  const u = await db.select().from(usersTable).where(eq(usersTable.id, profile.id)).all();
  return c.json({ ...profile, role: u[0]?.role ?? 'user' });
});

profileRoute.post('/:userId/reset-elo', requireLoggedIn(), async (c) => {
  const target = c.req.param('userId');
  if (target !== c.get('userId')) return c.json({ error: 'Không thể reset ELO của người khác!' }, 403);
  const profile = await getOrInitProfile(target, c);
  const db = createDb(c.env);
  await db.update(profilesTable).set({ ...defaultElo }).where(eq(profilesTable.id, profile.id));
  const u = await db.select().from(usersTable).where(eq(usersTable.id, profile.id)).all();
  return c.json({ ...profile, ...defaultElo, role: u[0]?.role ?? 'user' });
});
