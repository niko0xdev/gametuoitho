import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { openDb } from '@/server/db';

export async function POST(req: Request) {
  let body: { username?: string; password?: string; displayName?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Sai định dạng' }, { status: 400 }); }
  const { username, password, displayName } = body;
  if (!username || !password) return NextResponse.json({ error: 'Thiếu thông tin' }, { status: 400 });
  const db = openDb();
  const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
  if (exists) return NextResponse.json({ error: 'Tên đăng nhập đã tồn tại' }, { status: 409 });
  const hash = `sha256:${crypto.createHash('sha256').update(password).digest('hex')}`;
  const id = `u_${crypto.randomBytes(6).toString('hex')}`;
  db.prepare('INSERT INTO users (id, username, password_hash, display_name, avatar, role) VALUES (?, ?, ?, ?, ?, ?)').run(id, username, hash, displayName ?? username, `https://api.dicebear.com/7.x/pixel-art/svg?seed=${id}`, 'user');
  return NextResponse.json({ success: true, userId: id });
}
