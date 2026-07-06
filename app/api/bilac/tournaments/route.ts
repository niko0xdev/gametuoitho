import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { requireLoggedIn } from '@/server/middleware/auth';

export async function GET(req: Request) {
  const auth = await requireLoggedIn(req as never);
  if (auth instanceof NextResponse) return auth;
  const tours = db.getBiLacTournamentsForUser(auth.userId).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    createdAt: t.createdAt,
  }));
  return NextResponse.json(tours);
}

export async function POST(req: Request) {
  const auth = await requireLoggedIn(req as never);
  if (auth instanceof NextResponse) return auth;
  let body: { name?: string; code?: string; description?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Sai định dạng' }, { status: 400 }); }
  const { name, code, description } = body;
  if (!name || name.trim() === '') {
    return NextResponse.json({ error: 'Tên giải đấu không được để trống!' }, { status: 400 });
  }
  if (!code || code.trim() === '') {
    return NextResponse.json({ error: 'Mã truy cập giải đấu không được để trống!' }, { status: 400 });
  }
  const nameTrimmed = name.trim();
  const existing = db.getAllBiLacTournaments().find((t) => t.name.toLowerCase() === nameTrimmed.toLowerCase());
  if (existing) {
    return NextResponse.json({ error: 'Tên giải đấu này đã tồn tại!' }, { status: 400 });
  }
  const id = 'tour-' + Date.now();
  const tournament = {
    id,
    name: nameTrimmed,
    code: code.trim(),
    description: description ? description.trim() : '',
    createdAt: Date.now(),
    ownerUserId: auth.userId,
  };
  db.saveBiLacTournament(tournament);
  const user = db.getUser(auth.userId);
  db.saveBiLacTournamentMember({
    id: `mem-${id}-${auth.userId}`,
    tournamentId: id,
    userId: auth.userId,
    username: user?.username || auth.userId,
    displayName: (user as any)?.displayName || user?.username || auth.userId,
    role: 'owner',
    joinedAt: Date.now(),
  });
  return NextResponse.json({ success: true, tournament });
}