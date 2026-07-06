import { NextResponse } from 'next/server';
import { db } from '@/server/db';

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const tournament = db.getTournament(ctx.params.id);
  if (!tournament) return NextResponse.json({ error: 'Không tìm thấy giải đấu!' }, { status: 404 });
  return NextResponse.json(tournament);
}