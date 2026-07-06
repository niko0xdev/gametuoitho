import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { requireLoggedIn } from '@/server/middleware/auth';
import { tournamentManager } from '@/server/tournamentManager';

export async function GET() {
  return NextResponse.json(db.getAllTournaments());
}

export async function POST(req: Request) {
  const auth = await requireLoggedIn(req as never);
  if (auth instanceof NextResponse) return auth;
  let body: { name?: string; gameId?: string; maxPlayers?: number; deadlineSeconds?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Sai định dạng' }, { status: 400 }); }
  const { name, gameId, maxPlayers, deadlineSeconds } = body;
  if (!name || !gameId) return NextResponse.json({ error: 'Thiếu tên giải hoặc gameId' }, { status: 400 });
  const tournament = tournamentManager.createTournament(
    auth.userId,
    name,
    gameId,
    parseInt(String(maxPlayers)) || 16,
    parseInt(String(deadlineSeconds)) || 300,
  );
  return NextResponse.json(tournament);
}