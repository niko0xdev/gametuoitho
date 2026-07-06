import { NextResponse } from 'next/server';
import { openDb } from '@/server/db';
import { requireLoggedIn } from '@/server/middleware/auth';

export async function GET(req: Request) {
  const ctx = await requireLoggedIn(req as never);
  if (ctx instanceof NextResponse) return ctx;
  const db = openDb();
  const u = db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(ctx.userId);
  if (!u) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
  return NextResponse.json({ user: u });
}
