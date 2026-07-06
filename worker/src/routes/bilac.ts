// worker/src/routes/bilac.ts
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Bindings } from '../db';
import { createDb } from '../db';
import {
  bilacTournamentsTable, bilacPlayersTable, bilacMatchesTable,
} from '../schema';

export const bilacRoute = new Hono<{ Bindings: Bindings }>();

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
  c.set('tournamentId', tournamentId);
  await next();
};

bilacRoute.get('/tournaments', async (c) => {
  const db = createDb(c.env);
  const all = await db.select().from(bilacTournamentsTable).all();
  return c.json(all.map((t: any) => ({ id: t.id, name: t.name, description: t.description, createdAt: t.createdAt })));
});

bilacRoute.post('/tournaments/access', async (c) => {
  const { tournamentId, code } = await c.req.json();
  if (!tournamentId) return c.json({ error: 'Thiếu mã giải đấu!' }, 400);
  const db = createDb(c.env);
  const rows = await db.select().from(bilacTournamentsTable).where(eq(bilacTournamentsTable.id, tournamentId)).all();
  const tour = rows[0];
  if (!tour) return c.json({ error: 'Không tìm thấy giải đấu!' }, 404);
  if ((tour as any).code !== code) return c.json({ error: 'Mã truy cập không chính xác!' }, 403);
  return c.json({ success: true, tournament: { id: tour.id, name: (tour as any).name, description: (tour as any).description } });
});

bilacRoute.post('/tournaments', async (c) => {
  const { name, code, description } = await c.req.json();
  if (!name || !name.trim()) return c.json({ error: 'Tên giải đấu không được để trống!' }, 400);
  if (!code || !code.trim()) return c.json({ error: 'Mã truy cập giải đấu không được để trống!' }, 400);
  const id = 'tour-' + Date.now();
  const db = createDb(c.env);
  await db.insert(bilacTournamentsTable).values({ id, name: name.trim(), code: code.trim(), description: description?.trim() ?? null, createdAt: Date.now() } as any);
  return c.json({ success: true, tournament: { id, name: name.trim(), code: code.trim(), description: description?.trim() ?? '', createdAt: Date.now() } });
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

bilacRoute.delete('/players/:id', checkAccess, async (c: any) => {
  const playerId = c.req.param('id');
  const tournamentId = c.get('tournamentId');
  const db = createDb(c.env);
  const matches = await db.select().from(bilacMatchesTable).where(eq(bilacMatchesTable.tournamentId, tournamentId)).all();
  const hasMatch = matches.some((m: any) =>
    (m.team1 || '').includes(playerId) || (m.team2 || '').includes(playerId) || m.benched === playerId
  );
  if (hasMatch) return c.json({ error: 'Không thể xóa người chơi này vì họ đã tham gia ít nhất một trận đấu!' }, 400);
  await db.delete(bilacPlayersTable).where(eq(bilacPlayersTable.id, playerId));
  return c.json({ success: true });
});

bilacRoute.get('/matches', checkAccess, async (c: any) => {
  const tournamentId = c.get('tournamentId');
  const db = createDb(c.env);
  const all = await db.select().from(bilacMatchesTable).where(eq(bilacMatchesTable.tournamentId, tournamentId)).all();
  return c.json(all);
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
  return c.json(match);
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
  return c.json({ ...m, score1, score2, status });
});

bilacRoute.delete('/matches/:id', checkAccess, async (c: any) => {
  const matchId = c.req.param('id');
  const tournamentId = c.get('tournamentId');
  const db = createDb(c.env);
  const rows = await db.select().from(bilacMatchesTable).where(eq(bilacMatchesTable.id, matchId)).all();
  const m = rows[0];
  if (!m) return c.json({ error: 'Không tìm thấy trận đấu!' }, 404);
  if ((m as any).tournamentId !== tournamentId) return c.json({ error: 'Bạn không có quyền xóa trận đấu của giải đấu này!' }, 403);
  await db.delete(bilacMatchesTable).where(eq(bilacMatchesTable.id, matchId));
  return c.json({ success: true });
});
