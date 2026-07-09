// worker/src/routes/leagues.ts
import { Hono } from 'hono';
import { eq, and, like, or } from 'drizzle-orm';
import type { Bindings } from '../db';
import { createDb } from '../db';
import { myLeaguesTable, myLeagueMembersTable, usersTable } from '../schema';
import { requireLoggedIn } from '../lib/auth';

export const leaguesRoute = new Hono<{ Bindings: Bindings }>();

const SLUG_RE = /^[0-9a-z]{8}$/;

// teams/matches are stored as JSON strings; clients expect arrays.
const serializeLeague = (l: any) => {
  const parse = (v: any) => {
    try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
  };
  return { ...l, teams: parse(l.teams), matches: parse(l.matches) };
};

const generateSlug = () => {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
};

const roleOf = (members: any[], userId: string): string | null => {
  const m = members.find((x: any) => x.userId === userId);
  return m ? m.role : null;
};

// ── Access tiers (mirror express _middleware.ts) ─────────────────────────────
// Resolve league id + code from headers/query, verify the code, confirm login.
// Returns the league row + uid, or a Response if a gate failed.
async function resolveLeague(c: any): Promise<{ league: any; uid: string } | Response> {
  const leagueId = c.req.header('x-league-id') || c.req.query('leagueId');
  const code = c.req.header('x-league-code') || c.req.query('code');
  if (!leagueId) return c.json({ error: 'Thiếu mã giải đấu (League ID)!' }, 401);
  const db = createDb(c.env);
  const rows = await db.select().from(myLeaguesTable).where(eq(myLeaguesTable.id, leagueId)).all();
  const league = rows[0] as any;
  if (!league) return c.json({ error: 'Không tìm thấy giải đấu này!' }, 404);
  if (!league.code || league.code !== code) return c.json({ error: 'Mã truy cập không chính xác!' }, 403);
  const uid = c.req.header('x-user-id');
  if (!uid) return c.json({ error: 'Vui lòng đăng nhập để tiếp tục!' }, 401);
  const userRows = await db.select().from(usersTable).where(eq(usersTable.id, uid)).all();
  if (!userRows[0]) return c.json({ error: 'Tài khoản không tồn tại!' }, 401);
  return { league, uid };
}

const checkAccess = async (c: any, next: any) => {
  const res = await resolveLeague(c);
  if (res instanceof Response) return res;
  const db = createDb(c.env);
  const members = await db.select().from(myLeagueMembersTable).where(eq(myLeagueMembersTable.leagueId, res.league.id)).all();
  if (!roleOf(members, res.uid)) return c.json({ error: 'Bạn chưa là thành viên của giải đấu này!' }, 403);
  c.set('leagueId', res.league.id);
  c.set('userId', res.uid);
  await next();
};

const requireEditor = async (c: any, next: any) => {
  const res = await resolveLeague(c);
  if (res instanceof Response) return res;
  const db = createDb(c.env);
  const members = await db.select().from(myLeagueMembersTable).where(eq(myLeagueMembersTable.leagueId, res.league.id)).all();
  const role = roleOf(members, res.uid);
  if (role !== 'owner' && role !== 'admin') return c.json({ error: 'Chỉ chủ giải hoặc quản trị viên mới được chỉnh sửa!' }, 403);
  c.set('leagueId', res.league.id);
  c.set('userId', res.uid);
  await next();
};

const requireOwner = async (c: any, next: any) => {
  const res = await resolveLeague(c);
  if (res instanceof Response) return res;
  const db = createDb(c.env);
  const members = await db.select().from(myLeagueMembersTable).where(eq(myLeagueMembersTable.leagueId, res.league.id)).all();
  if (roleOf(members, res.uid) !== 'owner') return c.json({ error: 'Chỉ chủ giải mới có quyền thực hiện thao tác này!' }, 403);
  c.set('leagueId', res.league.id);
  c.set('userId', res.uid);
  await next();
};

// Shared user lookup for the invite-by-username flows (leagues + Bi Lắc).
// Prefix match on username + contains on displayName, capped at 8 rows.
// ponytail: no rate limiting — gated by requireLoggedIn; add a limiter if enumeration becomes a concern.
leaguesRoute.get('/users/search', requireLoggedIn(), async (c) => {
  const q = String(c.req.query('q') || '').trim();
  if (q.length < 2) return c.json({ users: [] });
  const db = createDb(c.env);
  const rows = await db.select({
    id: usersTable.id,
    username: usersTable.username,
    displayName: usersTable.displayName,
  })
    .from(usersTable)
    .where(or(like(usersTable.username, `${q.toLowerCase()}%`), like(usersTable.displayName, `%${q}%`)))
    .limit(8)
    .all();
  return c.json({ users: rows });
});

// All leagues with memberCount + caller's role. Code is never exposed.
leaguesRoute.get('/leagues', requireLoggedIn(), async (c) => {
  const userId = c.get('userId') as string;
  const db = createDb(c.env);
  const leagues = await db.select().from(myLeaguesTable).all();
  const memberRows = await db.select({
    leagueId: myLeagueMembersTable.leagueId,
    userId: myLeagueMembersTable.userId,
    role: myLeagueMembersTable.role,
  }).from(myLeagueMembersTable).all();

  const counts = new Map<string, number>();
  const myRole = new Map<string, string>();
  for (const m of memberRows) {
    counts.set(m.leagueId, (counts.get(m.leagueId) ?? 0) + 1);
    if (m.userId === userId) myRole.set(m.leagueId, m.role);
  }

  return c.json(leagues.map((l: any) => {
    const role = myRole.get(l.id) ?? null;
    return {
      ...serializeLeague(l),
      code: undefined,
      memberCount: counts.get(l.id) ?? 0,
      role,
      isMember: role !== null,
    };
  }));
});

// Public view-only snapshot keyed by slug. ?code= gates viewing.
leaguesRoute.get('/leagues/by-slug/:slug', async (c) => {
  const slug = c.req.param('slug');
  if (!slug || !SLUG_RE.test(slug)) return c.json({ error: 'Link giải đấu không hợp lệ.' }, 400);
  const db = createDb(c.env);
  const rows = await db.select().from(myLeaguesTable).where(eq(myLeaguesTable.slug, slug)).all();
  const league = rows[0] as any;
  if (!league) return c.json({ error: 'Giải đấu không tồn tại hoặc đã bị xoá.' }, 404);
  const code = c.req.query('code') || c.req.header('x-league-code');
  if (!league.code || league.code !== code) return c.json({ error: 'Mã truy cập không chính xác!' }, 403);

  let role: string | null = null;
  const uid = c.req.header('x-user-id');
  if (typeof uid === 'string' && uid) {
    const members = await db.select().from(myLeagueMembersTable).where(eq(myLeagueMembersTable.leagueId, league.id)).all();
    role = roleOf(members, uid);
  }
  return c.json({ ...serializeLeague(league), code: undefined, role, isMember: role !== null });
});

// Member code retrieval (owners/admins get the code back to cache for gated routes).
leaguesRoute.post('/leagues/access', requireLoggedIn(), async (c) => {
  const uid = c.get('userId') as string;
  const { leagueId } = await c.req.json();
  if (!leagueId) return c.json({ error: 'Thiếu mã giải đấu!' }, 400);
  const db = createDb(c.env);
  const rows = await db.select().from(myLeaguesTable).where(eq(myLeaguesTable.id, leagueId)).all();
  const league = rows[0] as any;
  if (!league) return c.json({ error: 'Không tìm thấy giải đấu!' }, 404);
  const members = await db.select().from(myLeagueMembersTable).where(eq(myLeagueMembersTable.leagueId, leagueId)).all();
  const role = roleOf(members, uid);
  if (role !== 'owner' && role !== 'admin') return c.json({ error: 'Bạn không phải thành viên của giải đấu này!' }, 403);
  return c.json({ success: true, league: { id: league.id, slug: league.slug, name: league.name, description: league.description }, code: league.code, role });
});

// Create: generate slug, store code, auto-add creator as owner.
leaguesRoute.post('/leagues', requireLoggedIn(), async (c) => {
  const uid = c.get('userId') as string;
  const body = await c.req.json();
  if (!body?.name || !String(body.name).trim()) return c.json({ error: 'Tên giải đấu không được để trống!' }, 400);
  if (!body?.code || !String(body.code).trim()) return c.json({ error: 'Mã truy cập giải đấu không được để trống!' }, 400);
  const db = createDb(c.env);
  let slug = generateSlug();
  for (let i = 0; i < 5; i++) {
    const existing = await db.select().from(myLeaguesTable).where(eq(myLeaguesTable.slug, slug)).all();
    if (!existing[0]) break;
    if (i === 4) return c.json({ error: 'Không thể tạo mã chia sẻ, thử lại.' }, 500);
    slug = generateSlug();
  }
  // Always generate the id server-side — never trust body.id (collision would
  // either overwrite (express upsert) or 500 (worker insert)). See express parity.
  const id = `league-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const league: any = {
    id,
    name: String(body.name).trim(),
    sport: body.sport || 'futsal',
    format: body.format || 'round_robin',
    status: body.status || 'ACTIVE',
    createdAt: body.createdAt || new Date().toISOString(),
    teams: JSON.stringify(body.teams || []),
    matches: JSON.stringify(body.matches || []),
    slug,
    code: String(body.code).trim(),
    description: body.description != null ? String(body.description).trim() : null,
    ownerUserId: uid,
  };
  await db.insert(myLeaguesTable).values(league);
  const creatorRows = await db.select().from(usersTable).where(eq(usersTable.id, uid)).all();
  const creator = creatorRows[0] as any;
  if (creator) {
    await db.insert(myLeagueMembersTable).values({
      id: `mem-${id}-${uid}`,
      leagueId: id,
      userId: uid,
      username: creator.username,
      displayName: creator.displayName,
      role: 'owner',
      joinedAt: Date.now(),
    } as any);
  }
  return c.json({ success: true, league: { ...serializeLeague(league), ownerUserId: uid } });
});

// Owner/admin: update mutable fields. slug + ownerUserId preserved.
leaguesRoute.put('/leagues/:id', requireEditor, async (c: any) => {
  const leagueId = c.get('leagueId');
  if (c.req.param('id') !== leagueId) return c.json({ error: 'League ID không khớp!' }, 400);
  const body = await c.req.json();
  if (!body?.name || !String(body.name).trim()) return c.json({ error: 'Tên giải đấu không được để trống!' }, 400);
  const db = createDb(c.env);
  const rows = await db.select().from(myLeaguesTable).where(eq(myLeaguesTable.id, leagueId)).all();
  const existing = rows[0] as any;
  if (!existing) return c.json({ error: 'Không tìm thấy giải đấu!' }, 404);
  const merged: any = {
    ...existing,
    ...body,
    id: leagueId,
    name: String(body.name).trim(),
    description: body.description != null ? String(body.description).trim() : existing.description,
    code: body.code ? String(body.code).trim() : existing.code,
    teams: JSON.stringify(body.teams ?? JSON.parse(existing.teams || '[]')),
    matches: JSON.stringify(body.matches ?? JSON.parse(existing.matches || '[]')),
    slug: existing.slug,            // preserve
    ownerUserId: existing.ownerUserId, // preserve
  };
  await db.update(myLeaguesTable).set({
    name: merged.name,
    sport: merged.sport,
    format: merged.format,
    status: merged.status,
    createdAt: merged.createdAt,
    teams: merged.teams,
    matches: merged.matches,
    code: merged.code,
    description: merged.description,
  } as any).where(eq(myLeaguesTable.id, leagueId));
  return c.json({ success: true, league: { ...serializeLeague(merged), code: undefined } });
});

// Owner only: cascade delete.
leaguesRoute.delete('/leagues/:id', requireOwner, async (c: any) => {
  const leagueId = c.get('leagueId');
  if (c.req.param('id') !== leagueId) return c.json({ error: 'League ID không khớp!' }, 400);
  const db = createDb(c.env);
  await db.delete(myLeagueMembersTable).where(eq(myLeagueMembersTable.leagueId, leagueId));
  await db.delete(myLeaguesTable).where(eq(myLeaguesTable.id, leagueId));
  return c.json({ success: true });
});

// Any member: list members.
leaguesRoute.get('/leagues/members', checkAccess, async (c: any) => {
  const leagueId = c.get('leagueId');
  const db = createDb(c.env);
  const members = await db.select().from(myLeagueMembersTable).where(eq(myLeagueMembersTable.leagueId, leagueId)).all();
  return c.json({
    success: true,
    members: members.map((m: any) => ({ id: m.id, leagueId: m.leagueId, userId: m.userId, username: m.username, displayName: m.displayName, role: m.role, joinedAt: m.joinedAt })),
  });
});

// Owner: invite admin by username.
leaguesRoute.post('/leagues/members', requireOwner, async (c: any) => {
  const leagueId = c.get('leagueId');
  const { username } = await c.req.json();
  if (!username || !String(username).trim()) return c.json({ error: 'Vui lòng nhập username!' }, 400);
  const trimmed = String(username).trim().toLowerCase();
  const db = createDb(c.env);
  const userRows = await db.select().from(usersTable).where(eq(usersTable.username, trimmed)).all();
  const target = userRows[0] as any;
  if (!target) return c.json({ error: 'Không tìm thấy user có username này!' }, 404);
  const existing = await db.select().from(myLeagueMembersTable).where(eq(myLeagueMembersTable.leagueId, leagueId)).all();
  if (existing.find((m: any) => m.userId === target.id)) return c.json({ error: 'User này đã là thành viên của giải!' }, 400);
  await db.insert(myLeagueMembersTable).values({
    id: `mem-${leagueId}-${target.id}-${Date.now()}`,
    leagueId,
    userId: target.id,
    username: target.username,
    displayName: target.displayName,
    role: 'admin',
    joinedAt: Date.now(),
  } as any);
  return c.json({ success: true, member: { userId: target.id, username: target.username, displayName: target.displayName, role: 'admin' } });
});

// Owner: remove member (owner cannot be removed).
leaguesRoute.delete('/leagues/members/:userId', requireOwner, async (c: any) => {
  const leagueId = c.get('leagueId');
  const reqUserId = c.get('userId');
  const targetUserId = c.req.param('userId');
  const db = createDb(c.env);
  const members = await db.select().from(myLeagueMembersTable).where(eq(myLeagueMembersTable.leagueId, leagueId)).all();
  const target = members.find((m: any) => m.userId === targetUserId);
  if (!target) return c.json({ error: 'User không phải thành viên của giải!' }, 404);
  if (targetUserId === reqUserId || (target as any).role === 'owner') return c.json({ error: 'Không thể xoá chủ giải!' }, 400);
  await db.delete(myLeagueMembersTable).where(eq(myLeagueMembersTable.id, (target as any).id));
  return c.json({ success: true });
});
