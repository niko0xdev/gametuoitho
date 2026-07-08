// worker/src/routes/bilac.ts
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Bindings } from '../db';
import { createDb } from '../db';
import {
  bilacTournamentsTable, bilacPlayersTable, bilacMatchesTable, bilacTournamentMembersTable, usersTable,
} from '../schema';
import { requireLoggedIn } from '../lib/auth';

export const bilacRoute = new Hono<{ Bindings: Bindings }>();

// team1/team2 are stored as JSON strings; clients expect arrays.
const serializeMatch = (m: any) => {
  const parse = (v: any) => {
    try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
  };
  return { ...m, team1: parse(m.team1), team2: parse(m.team2) };
};

function getBiLacWeeklyInterval(date: Date) {
  const utcMs = date.getTime() + (date.getTimezoneOffset() * 60000);
  const d = new Date(utcMs + (7 * 3600000));
  const day = d.getDay();
  const wed = new Date(d);
  const diff = 3 - day;
  wed.setDate(d.getDate() + diff);
  wed.setHours(11, 30, 0, 0);
  let start: Date, end: Date;
  if (d.getTime() < wed.getTime()) {
    start = new Date(wed); start.setDate(wed.getDate() - 7); start.setHours(12, 0, 0, 0);
    end = new Date(wed);
  } else {
    start = new Date(wed); start.setHours(12, 0, 0, 0);
    end = new Date(wed); end.setDate(wed.getDate() + 7);
  }
  const fmt = (x: Date) =>
    `${String(x.getDate()).padStart(2,'0')}/${String(x.getMonth()+1).padStart(2,'0')}/${x.getFullYear()}`;
  return { start, end, label: `Tuần từ ${fmt(start)} đến ${fmt(end)}` };
}

const checkAccess = async (c: any, next: any) => {
  const tournamentId = c.req.header('x-tournament-id') || c.req.query('tournamentId');
  const code = c.req.header('x-tournament-code') || c.req.query('code');
  if (!tournamentId) return c.json({ error: 'Thiếu mã giải đấu (Tournament ID)!' }, 401);
  const db = createDb(c.env);
  const rows = await db.select().from(bilacTournamentsTable).where(eq(bilacTournamentsTable.id, tournamentId)).all();
  if (!rows[0]) return c.json({ error: 'Không tìm thấy giải đấu này!' }, 404);
  if ((rows[0] as any).code !== code) return c.json({ error: 'Mã code truy cập không chính xác!' }, 403);
  // Require login on every gated route (parity with express checkBiLacTournamentAccess).
  const uid = c.req.header('x-user-id');
  if (!uid) return c.json({ error: 'Vui lòng đăng nhập để tiếp tục!' }, 401);
  const userRows = await db.select().from(usersTable).where(eq(usersTable.id, uid)).all();
  if (!userRows[0]) return c.json({ error: 'Tài khoản không tồn tại!' }, 401);
  c.set('tournamentId', tournamentId);
  c.set('userId', uid);
  await next();
};

// Require the logged-in user to be the tournament owner.
const requireOwner = async (c: any, next: any) => {
  const tournamentId = c.get('tournamentId');
  const userId = c.req.header('x-user-id');
  if (!userId) return c.json({ error: 'Yêu cầu đăng nhập!' }, 401);
  const db = createDb(c.env);
  const members = await db.select().from(bilacTournamentMembersTable).where(eq(bilacTournamentMembersTable.tournamentId, tournamentId)).all();
  const me = members.find((m: any) => m.userId === userId && m.role === 'owner');
  if (!me) return c.json({ error: 'Chỉ chủ giải đấu mới được thực hiện thao tác này!' }, 403);
  c.set('userId', userId);
  await next();
};

bilacRoute.get('/tournaments', requireLoggedIn(), async (c) => {
  const db = createDb(c.env);
  const userId = c.get('userId') as string;
  const tournaments = await db.select().from(bilacTournamentsTable).all();
  const memberRows = await db.select({
    tournamentId: bilacTournamentMembersTable.tournamentId,
    userId: bilacTournamentMembersTable.userId,
  }).from(bilacTournamentMembersTable).all();

  const counts = new Map<string, number>();
  const mySet = new Set<string>();
  for (const m of memberRows) {
    counts.set(m.tournamentId, (counts.get(m.tournamentId) ?? 0) + 1);
    if (m.userId === userId) mySet.add(m.tournamentId);
  }

  return c.json(tournaments.map((t: any) => ({
    id: t.id,
    slug: t.slug ?? undefined,
    name: t.name,
    description: t.description,
    createdAt: t.createdAt,
    memberCount: counts.get(t.id) ?? 0,
    isMember: mySet.has(t.id),
  })));
});

bilacRoute.post('/tournaments/access', async (c) => {
  const { tournamentId, code } = await c.req.json();
  if (!tournamentId) return c.json({ error: 'Thiếu mã giải đấu!' }, 400);
  const db = createDb(c.env);
  const rows = await db.select().from(bilacTournamentsTable).where(eq(bilacTournamentsTable.id, tournamentId)).all();
  const tour = rows[0] as any;
  if (!tour) return c.json({ error: 'Không tìm thấy giải đấu!' }, 404);

  // A logged-in member enters without the code. Logout clears the client's
  // cached code, so requiring it here would lock members out of their own
  // tournaments. Membership is the authority; return the code so the client
  // can cache it for the x-tournament-code header the gated routes still need.
  const uid = c.req.header('x-user-id');
  let isMember = false;
  if (uid) {
    const memberRows = await db.select().from(bilacTournamentMembersTable)
      .where(eq(bilacTournamentMembersTable.tournamentId, tournamentId)).all();
    isMember = memberRows.some((m: any) => m.userId === uid);
  }
  if (isMember || tour.code === code) {
    return c.json({ success: true, tournament: { id: tour.id, name: tour.name, description: tour.description }, code: tour.code });
  }
  return c.json({ error: 'Mã truy cập không chính xác!' }, 403);
});

bilacRoute.post('/tournaments', requireLoggedIn(), async (c) => {
  const creatorId = c.get('userId');
  const { name, code, description } = await c.req.json();
  if (!name || !name.trim()) return c.json({ error: 'Tên giải đấu không được để trống!' }, 400);
  if (!code || !code.trim()) return c.json({ error: 'Mã truy cập giải đấu không được để trống!' }, 400);
  const id = 'tour-' + Date.now();
  const db = createDb(c.env);
  // Duplicate-name guard (parity with express handler).
  const nameTrimmed = name.trim();
  const allTours = await db.select().from(bilacTournamentsTable).all();
  if (allTours.some((t: any) => (t.name || '').toLowerCase() === nameTrimmed.toLowerCase())) {
    return c.json({ error: 'Tên giải đấu này đã tồn tại!' }, 400);
  }
  // 8-char base36 slug for the public /bilac/{slug} view-only URL.
  const generateSlug = () => {
    const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
    const buf = new Uint8Array(8);
    crypto.getRandomValues(buf);
    let out = '';
    for (let i = 0; i < 8; i++) out += alphabet[buf[i] % alphabet.length];
    return out;
  };
  let slug = generateSlug();
  for (let i = 0; i < 5; i++) {
    const existing = await db.select().from(bilacTournamentsTable).where(eq(bilacTournamentsTable.slug, slug)).all();
    if (!existing[0]) break;
    if (i === 4) return c.json({ error: 'Không thể tạo slug, thử lại.' }, 500);
    slug = generateSlug();
  }
  await db.insert(bilacTournamentsTable).values({ id, slug, name: name.trim(), code: code.trim(), description: description?.trim() ?? null, createdAt: Date.now() } as any);
  // Auto-add creator as tournament owner.
  const creatorRows = await db.select().from(usersTable).where(eq(usersTable.id, creatorId)).all();
  const creator = creatorRows[0];
  if (creator) {
    await db.insert(bilacTournamentMembersTable).values({
      id: `mem-${id}-${creatorId}`,
      tournamentId: id,
      userId: creatorId,
      username: (creator as any).username,
      displayName: (creator as any).displayName,
      role: 'owner',
      joinedAt: Date.now(),
    } as any);
  }
  return c.json({ success: true, tournament: { id, slug, name: name.trim(), code: code.trim(), description: description?.trim() ?? '', createdAt: Date.now() } });
});

// Owner-only: rename tournament / update description. Code + slug preserved.
bilacRoute.put('/tournaments', checkAccess, requireOwner, async (c: any) => {
  const tournamentId = c.get('tournamentId');
  const { name, description } = await c.req.json();
  if (!name || !String(name).trim()) return c.json({ error: 'Tên giải đấu không được để trống!' }, 400);
  const nameTrimmed = String(name).trim();
  const db = createDb(c.env);
  // Preserve existing description when the body omits it (parity with express).
  const existingRows = await db.select().from(bilacTournamentsTable).where(eq(bilacTournamentsTable.id, tournamentId)).all();
  const existing = existingRows[0] as any;
  const descTrimmed = description != null ? String(description).trim() : (existing?.description ?? null);
  await db.update(bilacTournamentsTable).set({ name: nameTrimmed, description: descTrimmed } as any).where(eq(bilacTournamentsTable.id, tournamentId));
  return c.json({ success: true, tournament: { id: tournamentId, name: nameTrimmed, description: descTrimmed ?? '' } });
});

// Owner-only: cascade-delete the tournament and everything under it.
bilacRoute.delete('/tournaments/:id', checkAccess, requireOwner, async (c: any) => {
  const tournamentId = c.get('tournamentId');
  // URL :id must match the header-derived tournament (don't silently ignore it).
  if (c.req.param('id') !== tournamentId) return c.json({ error: 'Tournament ID không khớp!' }, 400);
  const db = createDb(c.env);
  await db.delete(bilacMatchesTable).where(eq(bilacMatchesTable.tournamentId, tournamentId));
  await db.delete(bilacPlayersTable).where(eq(bilacPlayersTable.tournamentId, tournamentId));
  await db.delete(bilacTournamentMembersTable).where(eq(bilacTournamentMembersTable.tournamentId, tournamentId));
  await db.delete(bilacTournamentsTable).where(eq(bilacTournamentsTable.id, tournamentId));
  return c.json({ success: true });
});

// Public read-only endpoint keyed by slug. No login required.
bilacRoute.get('/tournaments/by-slug/:slug', async (c) => {
  const slug = c.req.param('slug');
  if (!slug || !/^[0-9a-z]{8}$/.test(slug)) {
    return c.json({ error: 'Slug không hợp lệ.' }, 400);
  }
  const db = createDb(c.env);
  const rows = await db.select().from(bilacTournamentsTable).where(eq(bilacTournamentsTable.slug, slug)).all();
  const tour = rows[0] as any;
  if (!tour) return c.json({ error: 'Giải đấu không tồn tại hoặc đã bị xoá.' }, 404);

  const players = (await db.select().from(bilacPlayersTable).where(eq(bilacPlayersTable.tournamentId, tour.id)).all())
    .map((p: any) => ({ id: p.id, name: p.name, avatar: p.avatar }));

  const matches = (await db.select().from(bilacMatchesTable).where(eq(bilacMatchesTable.tournamentId, tour.id)).all())
    .map((m: any) => ({
      id: m.id,
      timestamp: m.timestamp,
      team1: m.team1,
      team2: m.team2,
      score1: m.score1,
      score2: m.score2,
      status: m.status,
    }));

  // Check isMember if x-user-id is present and the worker tracks members.
  const uid = c.req.header('x-user-id');
  let isMember = false;
  if (typeof uid === 'string' && uid) {
    const memberRows = await db
      .select()
      .from(bilacTournamentMembersTable)
      .where(eq(bilacTournamentMembersTable.tournamentId, tour.id))
      .all();
    isMember = memberRows.some((m: any) => m.userId === uid);
  }

  const memberCount = (await db
    .select()
    .from(bilacTournamentMembersTable)
    .where(eq(bilacTournamentMembersTable.tournamentId, tour.id))
    .all()).length;

  return c.json({
    id: tour.id,
    slug: tour.slug,
    name: tour.name,
    description: tour.description,
    createdAt: tour.createdAt,
    memberCount,
    isMember,
    players,
    matches,
  });
});

bilacRoute.get('/tournaments/members', checkAccess, async (c: any) => {
  const tournamentId = c.get('tournamentId');
  const db = createDb(c.env);
  const members = await db.select().from(bilacTournamentMembersTable).where(eq(bilacTournamentMembersTable.tournamentId, tournamentId)).all();
  return c.json({
    success: true,
    members: members.map((m: any) => ({ id: m.id, userId: m.userId, username: m.username, displayName: m.displayName, role: m.role, joinedAt: m.joinedAt })),
  });
});

bilacRoute.post('/tournaments/members', checkAccess, requireOwner, async (c: any) => {
  const tournamentId = c.get('tournamentId');
  const { username } = await c.req.json();
  if (!username || !String(username).trim()) return c.json({ error: 'Vui lòng nhập username!' }, 400);
  const trimmed = String(username).trim().toLowerCase();
  const db = createDb(c.env);
  const userRows = await db.select().from(usersTable).where(eq(usersTable.username, trimmed)).all();
  const target = userRows[0];
  if (!target) return c.json({ error: 'Không tìm thấy user có username này!' }, 404);
  const existing = await db.select().from(bilacTournamentMembersTable).where(eq(bilacTournamentMembersTable.tournamentId, tournamentId)).all();
  if (existing.find((m: any) => m.userId === (target as any).id)) return c.json({ error: 'User này đã là thành viên của giải!' }, 400);
  await db.insert(bilacTournamentMembersTable).values({
    id: `mem-${tournamentId}-${(target as any).id}-${Date.now()}`,
    tournamentId,
    userId: (target as any).id,
    username: (target as any).username,
    displayName: (target as any).displayName,
    role: 'member',
    joinedAt: Date.now(),
  } as any);
  return c.json({ success: true, member: { userId: (target as any).id, username: (target as any).username, displayName: (target as any).displayName, role: 'member' } });
});

bilacRoute.delete('/tournaments/members/:userId', checkAccess, requireOwner, async (c: any) => {
  const tournamentId = c.get('tournamentId');
  const reqUserId = c.get('userId');
  const targetUserId = c.req.param('userId');
  if (targetUserId === reqUserId) return c.json({ error: 'Không thể tự xoá chủ giải!' }, 400);
  const db = createDb(c.env);
  const members = await db.select().from(bilacTournamentMembersTable).where(eq(bilacTournamentMembersTable.tournamentId, tournamentId)).all();
  const target = members.find((m: any) => m.userId === targetUserId);
  if (!target) return c.json({ error: 'User không phải thành viên của giải!' }, 404);
  await db.delete(bilacTournamentMembersTable).where(eq(bilacTournamentMembersTable.id, (target as any).id));
  return c.json({ success: true });
});

bilacRoute.get('/players', checkAccess, async (c: any) => {
  const tournamentId = c.get('tournamentId');
  const db = createDb(c.env);
  const all = await db.select().from(bilacPlayersTable).where(eq(bilacPlayersTable.tournamentId, tournamentId)).all();
  return c.json(all);
});

bilacRoute.post('/players', checkAccess, async (c: any) => {
  const { name } = await c.req.json();
  const tournamentId = c.get('tournamentId');
  if (!name || !name.trim()) return c.json({ error: 'Tên người chơi không được để trống!' }, 400);
  const id = 'bl-' + Date.now();
  const avatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name.trim())}`;
  const db = createDb(c.env);
  await db.insert(bilacPlayersTable).values({ id, name: name.trim(), avatar, tournamentId } as any);
  return c.json({ id, name: name.trim(), avatar, tournamentId });
});

// Rename a player (regenerates the dicebear avatar). Any member may edit.
bilacRoute.put('/players/:id', checkAccess, async (c: any) => {
  const playerId = c.req.param('id');
  const tournamentId = c.get('tournamentId');
  const { name } = await c.req.json();
  if (!name || !String(name).trim()) return c.json({ error: 'Tên người chơi không được để trống!' }, 400);
  const nameTrimmed = String(name).trim();
  const db = createDb(c.env);
  const rows = await db.select().from(bilacPlayersTable).where(eq(bilacPlayersTable.id, playerId)).all();
  const existing = rows[0] as any;
  if (!existing || existing.tournamentId !== tournamentId) return c.json({ error: 'Không tìm thấy người chơi trong giải đấu này!' }, 404);
  const allPlayers = await db.select().from(bilacPlayersTable).where(eq(bilacPlayersTable.tournamentId, tournamentId)).all();
  if (allPlayers.find((p: any) => p.id !== playerId && p.name.toLowerCase() === nameTrimmed.toLowerCase())) {
    return c.json({ error: 'Tên người chơi đã tồn tại trong giải đấu này!' }, 400);
  }
  const avatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(nameTrimmed)}`;
  await db.update(bilacPlayersTable).set({ name: nameTrimmed, avatar } as any).where(eq(bilacPlayersTable.id, playerId));
  return c.json({ id: playerId, name: nameTrimmed, avatar, tournamentId });
});

bilacRoute.delete('/players/:id', checkAccess, async (c: any) => {
  const playerId = c.req.param('id');
  const tournamentId = c.get('tournamentId');
  const db = createDb(c.env);
  const matches = await db.select().from(bilacMatchesTable).where(eq(bilacMatchesTable.tournamentId, tournamentId)).all();
  // team1/team2 are JSON-stringified arrays — parse + exact match (substring .includes
  // would false-positive: 'bl-12' matches '["bl-123"]').
  const inTeam = (v: any) => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) && a.includes(playerId); } catch { return false; } };
  const hasMatch = matches.some((m: any) => inTeam(m.team1) || inTeam(m.team2) || m.benched === playerId);
  if (hasMatch) return c.json({ error: 'Không thể xóa người chơi này vì họ đã tham gia ít nhất một trận đấu!' }, 400);
  await db.delete(bilacPlayersTable).where(eq(bilacPlayersTable.id, playerId));
  return c.json({ success: true });
});

bilacRoute.get('/matches', checkAccess, async (c: any) => {
  const tournamentId = c.get('tournamentId');
  const db = createDb(c.env);
  const all = await db.select().from(bilacMatchesTable).where(eq(bilacMatchesTable.tournamentId, tournamentId)).all();
  return c.json(all.map(serializeMatch));
});

bilacRoute.post('/matches', checkAccess, async (c: any) => {
  const { playerIds } = await c.req.json();
  const tournamentId = c.get('tournamentId');
  if (!Array.isArray(playerIds) || playerIds.length < 2) {
    return c.json({ error: 'Cần ít nhất 2 người chơi để chia đội!' }, 400);
  }
  const db = createDb(c.env);
  const all = await db.select().from(bilacPlayersTable).where(eq(bilacPlayersTable.tournamentId, tournamentId)).all();
  const selected = all.filter((p: any) => playerIds.includes(p.id));
  if (selected.length < 2) return c.json({ error: 'Không tìm thấy người chơi hợp lệ trong hệ thống!' }, 400);

  const interval = getBiLacWeeklyInterval(new Date());
  const matchesAll = await db.select().from(bilacMatchesTable).where(eq(bilacMatchesTable.tournamentId, tournamentId)).all();

  const statsWeekly: Record<string, any> = {};
  const statsAllTime: Record<string, any> = {};
  selected.forEach((p: any) => { statsWeekly[p.id] = { points: 0, gd: 0, wins: 0, goals: 0 }; statsAllTime[p.id] = { points: 0, gd: 0, wins: 0, goals: 0 }; });

  matchesAll.filter((m: any) => m.status === 'FINISHED').forEach((m: any) => {
    const s1 = m.score1, s2 = m.score2, t1 = JSON.parse(m.team1 || '[]'), t2 = JSON.parse(m.team2 || '[]');
    const isWeekly = m.weekLabel === interval.label;
    t1.forEach((pid: string) => {
      if (statsAllTime[pid]) { statsAllTime[pid].goals += s1; statsAllTime[pid].gd += (s1 - s2); if (s1 > s2) { statsAllTime[pid].points += 3; statsAllTime[pid].wins += 1; } else if (s1 === s2) statsAllTime[pid].points += 1; }
      if (isWeekly && statsWeekly[pid]) { statsWeekly[pid].goals += s1; statsWeekly[pid].gd += (s1 - s2); if (s1 > s2) { statsWeekly[pid].points += 3; statsWeekly[pid].wins += 1; } else if (s1 === s2) statsWeekly[pid].points += 1; }
    });
    t2.forEach((pid: string) => {
      if (statsAllTime[pid]) { statsAllTime[pid].goals += s2; statsAllTime[pid].gd += (s2 - s1); if (s2 > s1) { statsAllTime[pid].points += 3; statsAllTime[pid].wins += 1; } else if (s1 === s2) statsAllTime[pid].points += 1; }
      if (isWeekly && statsWeekly[pid]) { statsWeekly[pid].goals += s2; statsWeekly[pid].gd += (s2 - s1); if (s2 > s1) { statsWeekly[pid].points += 3; statsWeekly[pid].wins += 1; } else if (s1 === s2) statsWeekly[pid].points += 1; }
    });
  });

  const sorted = [...selected].sort((a: any, b: any) => {
    const wA = statsWeekly[a.id], wB = statsWeekly[b.id];
    if (wB.points !== wA.points) return wB.points - wA.points;
    if (wB.gd !== wA.gd) return wB.gd - wA.gd;
    if (wB.wins !== wA.wins) return wB.wins - wA.wins;
    if (wB.goals !== wA.goals) return wB.goals - wA.goals;
    const aA = statsAllTime[a.id], aB = statsAllTime[b.id];
    if (aB.points !== aA.points) return aB.points - aA.points;
    if (aB.gd !== aA.gd) return aB.gd - aA.gd;
    if (aB.wins !== aA.wins) return aB.wins - aA.wins;
    if (aB.goals !== aA.goals) return aB.goals - aA.goals;
    return b.id.localeCompare(a.id);
  });

  let ids = sorted.map((p: any) => p.id);
  let benched: string | undefined;
  if (ids.length % 2 !== 0) {
    const bi = Math.floor(Math.random() * ids.length);
    benched = ids[bi];
    ids.splice(bi, 1);
  }
  const teamSize = ids.length / 2;
  const high = ids.slice(0, teamSize);
  const low = ids.slice(teamSize);
  const shuf = <T,>(arr: T[]): T[] => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const sh = shuf(high), sl = shuf(low);
  const t1: string[] = [], t2: string[] = [];
  const halfHigh = Math.floor(teamSize / 2);
  for (let i = 0; i < sh.length; i++) (i < halfHigh ? t1 : t2).push(sh[i]);
  const needLowT1 = teamSize - t1.length;
  for (let i = 0; i < sl.length; i++) (i < needLowT1 ? t1 : t2).push(sl[i]);

  const match = {
    id: 'match-' + Date.now(),
    timestamp: Date.now(),
    weekLabel: interval.label,
    team1: JSON.stringify(shuf(t1)),
    team2: JSON.stringify(shuf(t2)),
    score1: 0, score2: 0,
    status: 'PLAYING',
    benched: benched ?? null,
    tournamentId,
  };
  await db.insert(bilacMatchesTable).values(match as any);
  return c.json(serializeMatch(match));
});

bilacRoute.post('/matches/:id/update', checkAccess, async (c: any) => {
  const matchId = c.req.param('id');
  const tournamentId = c.get('tournamentId');
  const { score1, score2, status } = await c.req.json();
  const db = createDb(c.env);
  const rows = await db.select().from(bilacMatchesTable).where(eq(bilacMatchesTable.id, matchId)).all();
  const m = rows[0];
  if (!m) return c.json({ error: 'Không tìm thấy trận đấu!' }, 404);
  if ((m as any).tournamentId !== tournamentId) return c.json({ error: 'Bạn không có quyền chỉnh sửa trận đấu của giải đấu này!' }, 403);
  await db.update(bilacMatchesTable).set({ score1, score2, status } as any).where(eq(bilacMatchesTable.id, matchId));
  return c.json(serializeMatch({ ...m, score1, score2, status }));
});

bilacRoute.delete('/matches/:id', checkAccess, async (c: any) => {
  const matchId = c.req.param('id');
  const tournamentId = c.get('tournamentId');
  const db = createDb(c.env);
  const rows = await db.select().from(bilacMatchesTable).where(eq(bilacMatchesTable.id, matchId)).all();
  const m = rows[0];
  if (!m) return c.json({ error: 'Không tìm thấy trận đấu!' }, 404);
  if ((m as any).tournamentId !== tournamentId) return c.json({ error: 'Bạn không có quyền xóa trận đấu của giải đấu này!' }, 403);
  // Finished results are ranking-authoritative — only the owner may delete them.
  // In-progress matches may be cancelled by any member.
  if ((m as any).status === 'FINISHED') {
    const uid = c.req.header('x-user-id');
    const members = await db.select().from(bilacTournamentMembersTable).where(eq(bilacTournamentMembersTable.tournamentId, tournamentId)).all();
    const isOwner = !!members.find((mm: any) => mm.userId === uid && mm.role === 'owner');
    if (!isOwner) return c.json({ error: 'Chỉ chủ giải đấu mới được xoá kết quả trận đã ghi. Hãy nhờ chủ giải xoá giúp.' }, 403);
  }
  await db.delete(bilacMatchesTable).where(eq(bilacMatchesTable.id, matchId));
  return c.json({ success: true });
});
