import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import {
  checkBiLacTournamentAccess,
  requireBiLacMember,
  requireBiLacOwner,
} from '@/server/middleware/auth';

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const access = await checkBiLacTournamentAccess(req as never);
  if (access instanceof NextResponse) return access;
  if (access.tournamentId !== ctx.params.id) {
    return NextResponse.json({ error: 'Mã giải đấu không khớp' }, { status: 403 });
  }
  const members = db.getBiLacTournamentMembers(ctx.params.id).map((m) => ({
    id: m.id,
    userId: m.userId,
    username: m.username,
    displayName: m.displayName,
    role: m.role,
    joinedAt: m.joinedAt,
  }));
  return NextResponse.json({ success: true, members });
}

// ponytail: legacy POST /api/bilac/tournaments/members was invite-by-username
// (owner-only). The PR #5 spec collapses it into the "join" surface name. Owner
// invites a username → that user joins. upgrade path: split invite vs. self-join
// once a "user joins via code" flow is introduced.
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const access = await checkBiLacTournamentAccess(req as never);
  if (access instanceof NextResponse) return access;
  const owner = await requireBiLacOwner(access);
  if (owner instanceof NextResponse) return owner;
  if (owner.tournamentId !== ctx.params.id) {
    return NextResponse.json({ error: 'Mã giải đấu không khớp' }, { status: 403 });
  }
  let body: { username?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Sai định dạng' }, { status: 400 }); }
  if (!body.username || !String(body.username).trim()) {
    return NextResponse.json({ error: 'Vui lòng nhập username!' }, { status: 400 });
  }
  const trimmed = String(body.username).trim().toLowerCase();
  const targetUser = db.getUserByUsername(trimmed);
  if (!targetUser) {
    return NextResponse.json({ error: 'Không tìm thấy user có username này!' }, { status: 404 });
  }
  if (db.isBiLacTournamentMember(ctx.params.id, targetUser.id)) {
    return NextResponse.json({ error: 'User này đã là thành viên của giải!' }, { status: 400 });
  }
  db.saveBiLacTournamentMember({
    id: `mem-${ctx.params.id}-${targetUser.id}-${Date.now()}`,
    tournamentId: ctx.params.id,
    userId: targetUser.id,
    username: targetUser.username,
    displayName: targetUser.displayName,
    role: 'member',
    joinedAt: Date.now(),
  });
  return NextResponse.json({
    success: true,
    member: { userId: targetUser.id, username: targetUser.username, displayName: targetUser.displayName, role: 'member' },
  });
}