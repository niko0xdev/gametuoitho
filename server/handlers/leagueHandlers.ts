import type { Request, Response } from 'express';
import { db } from '../db.ts';
import { requireLoggedIn } from './_middleware.ts';
import type { MyLeague } from '../../src/types.ts';

const SLUG_RE = /^[0-9a-z]{8}$/;

// List all leagues enriched with memberCount + the caller's role. The secret
// `code` is stripped — members retrieve it via POST /access.
export function handleListLeagues(req: Request, res: Response) {
  const uid = requireLoggedIn(req, res);
  if (!uid) return;
  res.json(db.getAllMyLeaguesWithMembership(uid));
}

// Public view-only snapshot keyed by slug. The access code must be supplied
// (?code= or x-league-code) — that's the "passcode" viewers use to read.
// Returns the full league (teams + matches) so the view-only page can render
// schedule / standings / stats without any edit surface.
export function handleGetLeagueBySlug(req: Request, res: Response) {
  const { slug } = req.params;
  if (!slug || !SLUG_RE.test(slug)) {
    return res.status(400).json({ error: 'Link giải đấu không hợp lệ.' });
  }
  const league = db.getMyLeagueBySlug(slug);
  if (!league) {
    return res.status(404).json({ error: 'Giải đấu không tồn tại hoặc đã bị xoá.' });
  }
  const code = (req.query.code as string) || (req.headers['x-league-code'] as string);
  if (!league.code || league.code !== code) {
    return res.status(403).json({ error: 'Mã truy cập không chính xác!' });
  }
  // If the caller is a logged-in member, surface their role so the view-only
  // page can auto-promote to editor mode.
  const uid = req.headers['x-user-id'];
  let role: string | null = null;
  if (typeof uid === 'string' && uid) {
    role = db.getMyLeagueMemberRole(league.id, uid);
  }
  res.json({
    ...league,
    code: undefined, // never echo the secret back to a viewer
    role,
    isMember: role !== null,
  });
}

// Member code retrieval. Owners/admins get the code back so the client can
// cache it for the x-league-code header the gated routes require. Non-members
// are rejected — they must use the /by-slug share-link flow.
export function handleAccessLeague(req: Request, res: Response) {
  const uid = requireLoggedIn(req, res);
  if (!uid) return;
  const { leagueId } = req.body || {};
  if (!leagueId) return res.status(400).json({ error: 'Thiếu mã giải đấu!' });
  const league = db.getMyLeague(leagueId);
  if (!league) return res.status(404).json({ error: 'Không tìm thấy giải đấu!' });
  const role = db.getMyLeagueMemberRole(leagueId, uid);
  if (role !== 'owner' && role !== 'admin') {
    return res.status(403).json({ error: 'Bạn không phải thành viên của giải đấu này!' });
  }
  res.json({
    success: true,
    league: { id: league.id, slug: league.slug, name: league.name, description: league.description },
    code: league.code,
    role,
  });
}

// Create. Generates an 8-char slug, stores the owner-chosen code, and auto-adds
// the creator as the sole owner member.
export function handleCreateLeague(req: Request, res: Response) {
  const uid = requireLoggedIn(req, res);
  if (!uid) return;
  const body: Partial<MyLeague> = req.body || {};
  const { name, code, description } = body as any;
  if (!name || String(name).trim() === '') {
    return res.status(400).json({ error: 'Tên giải đấu không được để trống!' });
  }
  if (!code || String(code).trim() === '') {
    return res.status(400).json({ error: 'Mã truy cập giải đấu không được để trống!' });
  }
  let slug = db.generateMyLeagueSlug();
  for (let i = 0; i < 5; i++) {
    if (!db.getMyLeagueBySlug(slug)) break;
    if (i === 4) return res.status(500).json({ error: 'Không thể tạo mã chia sẻ, thử lại.' });
    slug = db.generateMyLeagueSlug();
  }
  const league: MyLeague = {
    id: body.id || `league-${Date.now()}`,
    name: String(name).trim(),
    sport: body.sport || 'futsal',
    format: body.format || 'round_robin',
    status: body.status || 'ACTIVE',
    createdAt: body.createdAt || new Date().toISOString(),
    teams: body.teams || [],
    matches: body.matches || [],
    slug,
    code: String(code).trim(),
    description: description != null ? String(description).trim() : '',
    ownerUserId: uid,
  };
  db.saveMyLeague(league);

  const user = db.getUser(uid);
  db.saveMyLeagueMember({
    id: `mem-${league.id}-${uid}`,
    leagueId: league.id,
    userId: uid,
    username: user?.username || uid,
    displayName: user?.displayName || user?.username || uid,
    role: 'owner',
    joinedAt: Date.now(),
  });

  res.json({ success: true, league });
}

// Owner/admin: update mutable fields (name, description, code, teams, matches,
// status, ...). slug + ownerUserId are preserved server-side so a stale client
// payload can't clobber the share handle or ownership.
export function handlePutLeague(req: Request, res: Response) {
  const leagueId = (req as any).leagueId;
  // Defense-in-depth: the URL :id must match the header-derived league (mirrors DELETE).
  if (req.params.id !== leagueId) {
    return res.status(400).json({ error: 'League ID không khớp!' });
  }
  const body: Partial<MyLeague> = req.body || {};
  if (!body.name || String(body.name).trim() === '') {
    return res.status(400).json({ error: 'Tên giải đấu không được để trống!' });
  }
  const existing = db.getMyLeague(leagueId);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy giải đấu!' });
  const merged: MyLeague = {
    ...existing,
    ...body,
    id: leagueId,
    name: String(body.name).trim(),
    description: body.description != null ? String(body.description).trim() : existing.description,
    code: body.code ? String(body.code).trim() : existing.code,
    slug: existing.slug,          // preserve
    ownerUserId: existing.ownerUserId, // preserve
  };
  db.saveMyLeague(merged);
  res.json({ success: true, league: { ...merged, code: undefined } });
}

// Owner only: cascade-delete the league + its members.
export function handleDeleteLeague(req: Request, res: Response) {
  const leagueId = (req as any).leagueId;
  if (req.params.id !== leagueId) {
    return res.status(400).json({ error: 'League ID không khớp!' });
  }
  if (!db.getMyLeague(leagueId)) {
    return res.status(404).json({ error: 'Không tìm thấy giải đấu!' });
  }
  db.deleteMyLeagueCascade(leagueId);
  res.json({ success: true });
}

// Any member: list members (owner + admins).
export function handleListLeagueMembers(req: Request, res: Response) {
  const leagueId = (req as any).leagueId;
  res.json({ success: true, members: db.getMyLeagueMembers(leagueId) });
}

// Owner only: invite a user as an admin by username.
export function handleInviteLeagueMember(req: Request, res: Response) {
  const leagueId = (req as any).leagueId;
  const { username } = req.body || {};
  if (!username || !String(username).trim()) {
    return res.status(400).json({ error: 'Vui lòng nhập username!' });
  }
  const trimmed = String(username).trim().toLowerCase();
  const target = db.getUserByUsername(trimmed);
  if (!target) return res.status(404).json({ error: 'Không tìm thấy user có username này!' });
  if (db.isMyLeagueMember(leagueId, target.id)) {
    return res.status(400).json({ error: 'User này đã là thành viên của giải!' });
  }
  db.saveMyLeagueMember({
    id: `mem-${leagueId}-${target.id}-${Date.now()}`,
    leagueId,
    userId: target.id,
    username: target.username,
    displayName: target.displayName,
    role: 'admin',
    joinedAt: Date.now(),
  });
  res.json({ success: true, member: { userId: target.id, username: target.username, displayName: target.displayName, role: 'admin' } });
}

// Owner only: remove a member. The owner cannot be removed.
export function handleRemoveLeagueMember(req: Request, res: Response) {
  const leagueId = (req as any).leagueId;
  const reqUserId = (req as any).userId;
  const targetUserId = req.params.userId;
  if (targetUserId === reqUserId || db.isMyLeagueOwner(leagueId, targetUserId)) {
    return res.status(400).json({ error: 'Không thể xoá chủ giải!' });
  }
  if (!db.isMyLeagueMember(leagueId, targetUserId)) {
    return res.status(404).json({ error: 'User không phải thành viên của giải!' });
  }
  db.deleteMyLeagueMember(leagueId, targetUserId);
  res.json({ success: true });
}
