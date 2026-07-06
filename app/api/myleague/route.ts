import { NextResponse } from 'next/server';
import { db } from '@/server/db';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId');
  if (userId) {
    const perms = db.getLeaguePermissions();
    if (perms[userId] !== true) {
      return NextResponse.json({ error: 'Quyền truy cập bị hạn chế' }, { status: 403 });
    }
  }
  return NextResponse.json(db.getAllMyLeagues());
}

export async function POST(req: Request) {
  let league: { id?: string; name?: string } | null;
  try { league = await req.json(); } catch { return NextResponse.json({ error: 'Sai định dạng' }, { status: 400 }); }
  if (!league || !league.id || !league.name) {
    return NextResponse.json({ error: 'Dữ liệu giải đấu không hợp lệ!' }, { status: 400 });
  }
  db.saveMyLeague(league as any);
  return NextResponse.json(league);
}