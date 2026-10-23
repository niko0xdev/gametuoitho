import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Context } from 'hono';
import type { Bindings } from '../db';
import { sha256Hex } from './password';

export async function issueSession<E extends { Bindings: Bindings }>(c: Context<E>, userId: string) {
  const user = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(userId).first<{ password_hash: string }>();
  if (!user) throw new Error('Session account missing');
  await revokeSession(c, false);
  const token = crypto.randomUUID() + crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO auth_sessions (token_hash,user_id,credential_hash,expires_at) VALUES (?,?,?,?)')
    .bind(await sha256Hex(token), userId, user.password_hash, Date.now() + 7 * 86400000).run();
  setCookie(c, 'bilac_session', token, { httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Lax', path: '/api', maxAge: 7 * 86400 });
}

export async function sessionUser<E extends { Bindings: Bindings }>(c: Context<E>): Promise<string | null> {
  const token = getCookie(c, 'bilac_session');
  if (!token || token.length > 200) return null;
  const row = await c.env.DB.prepare(`SELECT s.user_id FROM auth_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>? AND s.credential_hash=u.password_hash`)
    .bind(await sha256Hex(token), Date.now()).first<{ user_id: string }>();
  return row?.user_id ?? null;
}

export function sameOrigin<E extends { Bindings: Bindings }>(c: Context<E>): boolean {
  const origin = c.req.header('Origin');
  return !origin || origin === new URL(c.req.url).origin || origin === c.env.APP_URL;
}

export async function revokeSession<E extends { Bindings: Bindings }>(c: Context<E>, clearCookie = true) {
  const token = getCookie(c, 'bilac_session');
  if (token) await c.env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(await sha256Hex(token)).run();
  if (clearCookie) deleteCookie(c, 'bilac_session', { path: '/api', secure: new URL(c.req.url).protocol === 'https:', httpOnly: true, sameSite: 'Lax' });
}
