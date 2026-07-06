import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import {
  checkBiLacTournamentAccess,
  requireBiLacMember,
} from '@/server/middleware/auth';

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const access = await checkBiLacTournamentAccess(req as never);
  if (access instanceof NextResponse) return access;
  if (access.tournamentId !== ctx.params.id) {
    return NextResponse.json({ error: 'Mã giải đấu không khớp' }, { status: 403 });
  }
  const member = await requireBiLacMember(access);
  if (member instanceof NextResponse) return member;
  const tour = db.getBiLacTournament(ctx.params.id);
  if (!tour) return NextResponse.json({ error: 'Không tìm thấy giải đấu' }, { status: 404 });
  return NextResponse.json({
    id: tour.id,
    name: tour.name,
    description: tour.description,
    code: tour.code,
    createdAt: tour.createdAt,
  });
}

export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  const access = await checkBiLacTournamentAccess(req as never);
  if (access instanceof NextResponse) return access;
  if (access.tournamentId !== ctx.params.id) {
    return NextResponse.json({ error: 'Mã giải đấu không khớp' }, { status: 403 });
  }
  const member = await requireBiLacMember(access);
  if (member instanceof NextResponse) return member;
  if (member.role !== 'owner') {
    return NextResponse.json({ error: 'Chỉ chủ giải mới có quyền xoá giải đấu' }, { status: 403 });
  }
  db.deleteBiLacTournament(ctx.params.id);
  return NextResponse.json({ success: true });
}