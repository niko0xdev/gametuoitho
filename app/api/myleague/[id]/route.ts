import { NextResponse } from 'next/server';
import { db } from '@/server/db';

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const league = db.getAllMyLeagues().find((l: any) => l.id === ctx.params.id);
  if (!league) return NextResponse.json({ error: 'Không tìm thấy giải' }, { status: 404 });
  return NextResponse.json(league);
}

export async function PUT(req: Request, ctx: { params: { id: string } }) {
  let league: { id?: string; name?: string } | null;
  try { league = await req.json(); } catch { return NextResponse.json({ error: 'Sai định dạng' }, { status: 400 }); }
  if (!league || !league.id || !league.name) {
    return NextResponse.json({ error: 'Dữ liệu giải đấu không hợp lệ!' }, { status: 400 });
  }
  if (league.id !== ctx.params.id) {
    return NextResponse.json({ error: 'ID không khớp' }, { status: 400 });
  }
  db.saveMyLeague(league as any);
  return NextResponse.json(league);
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  db.deleteMyLeague(ctx.params.id);
  return NextResponse.json({ success: true });
}