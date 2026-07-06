import { NextResponse } from 'next/server';
import { requireLoggedIn } from '@/server/middleware/auth';
import { tournamentManager } from '@/server/tournamentManager';

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requireLoggedIn(req as never);
  if (auth instanceof NextResponse) return auth;
  void ctx; // legacy join is by code, not by id — kept for URL symmetry
  let body: { code?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Sai định dạng' }, { status: 400 }); }
  if (!body.code) return NextResponse.json({ error: 'Thiếu mã giải đấu' }, { status: 400 });
  const tournament = tournamentManager.joinTournament(auth.userId, body.code);
  if (!tournament) {
    return NextResponse.json({ error: 'Không thể tham gia giải đấu! Giải đấu có thể đã đầy hoặc mã không hợp lệ.' }, { status: 400 });
  }
  return NextResponse.json(tournament);
}