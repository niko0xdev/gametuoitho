import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { openDb } from '@/server/db';

export async function POST(req: Request) {
  let body: { username?: string; password?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Sai định dạng' }, { status: 400 }); }
  const { username, password } = body;
  if (!username || !password) return NextResponse.json({ error: 'Thiếu tên đăng nhập hoặc mật khẩu' }, { status: 400 });
  const db = openDb();
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  const row = db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get(username) as { id: string; password_hash: string } | undefined;
  if (!row) return NextResponse.json({ error: 'Không tìm thấy tài khoản' }, { status: 404 });
  if (row.password_hash !== `sha256:${hash}`) return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  return NextResponse.json({ success: true, userId: row.id });
}
