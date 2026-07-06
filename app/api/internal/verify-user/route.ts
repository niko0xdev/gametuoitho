import { NextResponse } from 'next/server';
import { openDb } from '@/server/db';

export async function GET(req: Request) {
  const secret = req.headers.get('x-internal-secret');
  if (secret !== process.env.WS_INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Cấm' }, { status: 403 });
  }
  const u = new URL(req.url).searchParams.get('userId');
  if (!u) return NextResponse.json({ error: 'Thiếu userId' }, { status: 400 });
  const db = openDb();
  const row = db.prepare('SELECT id FROM users WHERE id = ?').get(u);
  if (!row) return NextResponse.json({ error: 'Không' }, { status: 404 });
  return NextResponse.json({ ok: true });
}