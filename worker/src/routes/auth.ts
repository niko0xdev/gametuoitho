// worker/src/routes/auth.ts
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Bindings } from '../db';
import { createDb } from '../db';
import { usersTable, profilesTable } from '../schema';
import {
  sha256Hex, validatePassword, generateOtp,
  OTP_TTL_MS, OTP_RESEND_MIN_MS, OTP_MAX_ATTEMPTS,
} from '../lib/password';
import { sendOtpEmail } from '../lib/email';
import { jwtVerify, createRemoteJWKSet } from 'jose';

// Google OIDC public keys (cached by jose).
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export const authRoute = new Hono<{ Bindings: Bindings }>();

// Per-IP rate limit on sensitive auth endpoints (anti-spam). Returns a 429
// Response when over the limit, null otherwise. Absent binding (local dev) => allow.
const ipRateLimit = async (c: any, key: string): Promise<Response | null> => {
  if (!c.env.RATE_LIMITER) return null;
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
  const { success } = await c.env.RATE_LIMITER.limit({ key: `${key}:${ip}` });
  return success ? null : c.json({ error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.' }, 429);
};

const userPublic = (u: any) => ({
  id: u.id, username: u.username, email: u.email,
  displayName: u.displayName, avatar: u.avatar, role: u.role,
});

// Atomically bump today's OTP-send counter; returns the new count. Combined
// with OTP_DAILY_CAP this bounds total daily Resend usage regardless of how
// many IPs an attacker rotates past the per-IP rate limit.
async function bumpDailyOtp(env: Bindings): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare(
    `INSERT INTO daily_counters (date, otp_sends) VALUES (?1, 1)
     ON CONFLICT(date) DO UPDATE SET otp_sends = otp_sends + 1
     RETURNING otp_sends`,
  ).bind(today).first<{ otp_sends: number }>();
  return row?.otp_sends ?? 1;
}

// Returns a 429 Response when the daily OTP cap is exceeded, else null.
async function guardOtpCap(c: any): Promise<Response | null> {
  const cap = Number(c.env.OTP_DAILY_CAP ?? 80);
  if ((await bumpDailyOtp(c.env)) > cap) {
    return c.json({ error: 'Hệ thống đã gửi quá nhiều mã OTP hôm nay. Vui lòng thử lại sau.' }, 429);
  }
  return null;
}

// Verify a Cloudflare Turnstile token server-side. Returns true (allow) when
// TURNSTILE_SECRET is unset so local dev/preview isn't blocked; prod sets the
// secret + sitekey to enforce.
async function verifyTurnstile(c: any, token: string | undefined): Promise<boolean> {
  const secret = c.env.TURNSTILE_SECRET;
  if (!secret) return true;
  if (!token) return false;
  const form = new URLSearchParams();
  form.append('secret', secret);
  form.append('response', token);
  const ip = c.req.header('cf-connecting-ip');
  if (ip) form.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const data = await res.json<{ success: boolean }>();
    return data.success === true;
  } catch {
    return false;
  }
}

// Issue an OTP (hashed at rest), persist it, and email it. Used by register,
// resend-otp, and forgot-password.
async function issueOtp(c: any, user: any): Promise<Response | null> {
  const cap = await guardOtpCap(c);
  if (cap) return cap;
  const otp = generateOtp();
  const otpHash = await sha256Hex(otp);
  const db = createDb(c.env);
  await db.update(usersTable).set({
    otp: otpHash,
    otpExpires: Date.now() + OTP_TTL_MS,
    otpAttempts: 0,
    lastOtpAt: Date.now(),
  } as any).where(eq(usersTable.id, user.id));
  await sendOtpEmail(c.env, user.email, user.displayName, otp);
  return null;
}

authRoute.post('/register', async (c) => {
  const rl = await ipRateLimit(c, 'register');
  if (rl) return rl;
  const { username, password, email, displayName, turnstileToken } = await c.req.json();
  if (!username || !password || !email || !displayName) {
    return c.json({ error: 'Vui lòng nhập đầy đủ thông tin đăng ký!' }, 400);
  }
  const pwCheck = validatePassword(password);
  if (!pwCheck.ok) return c.json({ error: pwCheck.error! }, 400);
  if (!(await verifyTurnstile(c, turnstileToken))) {
    return c.json({ error: 'Xác thực chống bot thất bại. Vui lòng làm mới và thử lại.' }, 400);
  }

  const tu = username.trim().toLowerCase();
  const te = email.trim().toLowerCase();
  const db = createDb(c.env);

  const existing = await db.select().from(usersTable).where(eq(usersTable.username, tu)).all();
  if (existing.length) return c.json({ error: 'Tên tài khoản này đã tồn tại!' }, 400);
  const byEmail = await db.select().from(usersTable).where(eq(usersTable.email, te)).all();
  if (byEmail.length) return c.json({ error: 'Email này đã được đăng ký!' }, 400);

  const cap = await guardOtpCap(c);
  if (cap) return cap;

  const userId = 'user_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const passwordHash = await sha256Hex(password);
  const avatar = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(userId)}`;
  const otp = generateOtp();
  const otpHash = await sha256Hex(otp);

  await db.insert(usersTable).values({
    id: userId, username: tu, email: te, passwordHash,
    displayName: displayName.trim(), avatar, role: 'user',
    otp: otpHash, otpExpires: Date.now() + OTP_TTL_MS,
    otpAttempts: 0, lastOtpAt: Date.now(), emailVerified: 0, createdAt: Date.now(),
  } as any);
  await db.insert(profilesTable).values({
    id: userId, displayName: displayName.trim(), avatar,
    eloCaro: 1500, eloCoTuong: 1500, eloCoVua: 1500, eloOAnQuan: 1500,
    eloCoCaNgua: 1500, eloDuoiHinhBatChu: 1500, eloNoiChu: 1500, eloDoanTu: 1500,
    honorScore: 100, badges: '[]',
  });

  await sendOtpEmail(c.env, te, displayName.trim(), otp);
  return c.json({ success: true, needsVerification: true, email: te });
});

authRoute.post('/verify-email', async (c) => {
  const rl = await ipRateLimit(c, 'verify');
  if (rl) return rl;
  const { email, otp } = await c.req.json();
  if (!email || !otp) return c.json({ error: 'Thiếu email hoặc mã OTP!' }, 400);
  const db = createDb(c.env);
  const rows = await db.select().from(usersTable).where(eq(usersTable.email, String(email).trim().toLowerCase())).all();
  const user = rows[0];
  if (!user) return c.json({ error: 'Không tìm thấy tài khoản!' }, 404);

  const err = await verifyOtpAttempt(c, user, otp);
  if (err) return err;

  await db.update(usersTable).set({
    emailVerified: 1, otp: null, otpExpires: null, otpAttempts: 0,
  } as any).where(eq(usersTable.id, user.id));
  return c.json({ success: true, user: userPublic({ ...user, emailVerified: 1 }) });
});

authRoute.post('/resend-otp', async (c) => {
  const rl = await ipRateLimit(c, 'resend');
  if (rl) return rl;
  const { email } = await c.req.json();
  if (!email) return c.json({ error: 'Thiếu email!' }, 400);
  const db = createDb(c.env);
  const rows = await db.select().from(usersTable).where(eq(usersTable.email, String(email).trim().toLowerCase())).all();
  const user = rows[0];
  if (!user) return c.json({ error: 'Không tìm thấy tài khoản!' }, 404);
  if (user.lastOtpAt && Date.now() - user.lastOtpAt < OTP_RESEND_MIN_MS) {
    return c.json({ error: 'Vui lòng đợi 60 giây trước khi yêu cầu mã mới.' }, 429);
  }
  const otpErr = await issueOtp(c, user);
  if (otpErr) return otpErr;
  return c.json({ success: true, message: 'Đã gửi mã OTP mới về email.' });
});

authRoute.post('/login', async (c) => {
  const { username, password } = await c.req.json();
  if (!username || !password) {
    return c.json({ error: 'Vui lòng điền đầy đủ email/tên đăng nhập và mật khẩu!' }, 400);
  }
  const db = createDb(c.env);
  // Login accepts either email or username (backward-compatible with existing
  // accounts that log in by handle).
  const input = String(username).trim().toLowerCase();
  const byEmail = await db.select().from(usersTable).where(eq(usersTable.email, input)).all();
  const byUsername = await db.select().from(usersTable).where(eq(usersTable.username, input)).all();
  const user = byEmail[0] ?? byUsername[0];
  if (!user) return c.json({ error: 'Tài khoản không tồn tại!' }, 400);
  if (user.isGoogleUser) return c.json({ error: 'Tài khoản này đăng nhập bằng Google SSO!' }, 400);

  const hash = await sha256Hex(password);
  if (user.passwordHash !== hash) return c.json({ error: 'Mật khẩu không chính xác!' }, 400);
  if (!user.emailVerified) {
    return c.json({ error: 'Tài khoản chưa xác thực email. Vui lòng kiểm tra hộp thư của bạn.' }, 403);
  }
  return c.json({ success: true, user: userPublic(user) });
});

// Shared OTP verify+attempt logic for /verify-email and /reset-password.
async function verifyOtpAttempt(c: any, user: any, otpInput: any): Promise<Response | null> {
  if (!user.otp || !user.otpExpires) {
    return c.json({ error: 'Chưa có mã OTP. Vui lòng yêu cầu mã mới.' }, 400);
  }
  if (Date.now() > user.otpExpires) return c.json({ error: 'Mã OTP đã hết hạn!' }, 400);
  if ((user.otpAttempts ?? 0) >= OTP_MAX_ATTEMPTS) {
    return c.json({ error: 'Bạn đã nhập sai quá nhiều lần. Vui lòng yêu cầu mã OTP mới.' }, 400);
  }
  const hash = await sha256Hex(String(otpInput).trim());
  if (hash !== user.otp) {
    const db = createDb(c.env);
    await db.update(usersTable).set({ otpAttempts: (user.otpAttempts ?? 0) + 1 }).where(eq(usersTable.id, user.id));
    return c.json({ error: 'Mã OTP không chính xác!' }, 400);
  }
  return null;
}

authRoute.post('/google-sso', async (c) => {
  const { credential } = await c.req.json();
  if (!credential) return c.json({ error: 'Thiếu Google credential!' }, 400);
  if (!c.env.GOOGLE_CLIENT_ID) {
    return c.json({ error: 'Chưa cấu hình GOOGLE_CLIENT_ID trên Worker!' }, 500);
  }

  let payload;
  try {
    const verified = await jwtVerify(credential, GOOGLE_JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: c.env.GOOGLE_CLIENT_ID,
    });
    payload = verified.payload;
  } catch {
    return c.json({ error: 'Token Google không hợp lệ hoặc đã hết hạn!' }, 401);
  }

  const email = (payload.email as string | undefined)?.trim().toLowerCase();
  if (!email) return c.json({ error: 'Token Google không chứa email!' }, 400);
  if (!payload.email_verified) return c.json({ error: 'Email Google chưa được xác thực!' }, 400);

  const displayName = (payload.name as string | undefined) || email.split('@')[0];
  const avatar = (payload.picture as string | undefined) || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(email)}`;
  const sub = (payload.sub as string | undefined) || email;

  const db = createDb(c.env);
  const rows = await db.select().from(usersTable).where(eq(usersTable.email, email)).all();
  let user = rows[0];

  if (!user) {
    const userId = 'user_g_' + sub;
    const tempUsername = ('g_' + sub).slice(0, 30);
    await db.insert(usersTable).values({
      id: userId, username: tempUsername, email, passwordHash: '',
      displayName, avatar, role: 'user', isGoogleUser: 1, emailVerified: 1,
    } as any);
    await db.insert(profilesTable).values({
      id: userId, displayName, avatar,
      eloCaro: 1500, eloCoTuong: 1500, eloCoVua: 1500, eloOAnQuan: 1500,
      eloCoCaNgua: 1500, eloDuoiHinhBatChu: 1500, eloNoiChu: 1500, eloDoanTu: 1500,
      honorScore: 100, badges: '[]',
    });
    user = { id: userId, username: tempUsername, email, displayName, avatar, role: 'user' } as typeof user;
  }

  return c.json({ success: true, user: userPublic(user) });
});

authRoute.post('/forgot-password', async (c) => {
  const rl = await ipRateLimit(c, 'forgot');
  if (rl) return rl;
  const { email } = await c.req.json();
  if (!email) return c.json({ error: 'Vui lòng cung cấp địa chỉ email!' }, 400);
  const db = createDb(c.env);
  const rows = await db.select().from(usersTable).where(eq(usersTable.email, String(email).trim().toLowerCase())).all();
  const user = rows[0];
  // Do not reveal whether the email exists.
  if (!user) return c.json({ success: true, message: 'Nếu email tồn tại, mã OTP đã được gửi.' });
  if (user.lastOtpAt && Date.now() - user.lastOtpAt < OTP_RESEND_MIN_MS) {
    return c.json({ error: 'Vui lòng đợi 60 giây trước khi yêu cầu mã mới.' }, 429);
  }
  const otpErr = await issueOtp(c, user);
  if (otpErr) return otpErr;
  return c.json({ success: true, message: 'Mã OTP đã được gửi về email của bạn.' });
});

authRoute.post('/reset-password', async (c) => {
  const rl = await ipRateLimit(c, 'reset');
  if (rl) return rl;
  const { email, otp, newPassword } = await c.req.json();
  if (!email || !otp || !newPassword) {
    return c.json({ error: 'Vui lòng cung cấp đầy đủ email, mã OTP và mật khẩu mới!' }, 400);
  }
  const pwCheck = validatePassword(newPassword);
  if (!pwCheck.ok) return c.json({ error: pwCheck.error! }, 400);

  const db = createDb(c.env);
  const rows = await db.select().from(usersTable).where(eq(usersTable.email, String(email).trim().toLowerCase())).all();
  const user = rows[0];
  if (!user) return c.json({ error: 'Không tìm thấy tài khoản!' }, 404);

  const err = await verifyOtpAttempt(c, user, otp);
  if (err) return err;

  const passwordHash = await sha256Hex(newPassword);
  await db.update(usersTable).set({
    passwordHash, otp: null, otpExpires: null, otpAttempts: 0,
  } as any).where(eq(usersTable.id, user.id));

  return c.json({ success: true, message: 'Đổi mật khẩu thành công! Bạn có thể đăng nhập với mật khẩu mới.' });
});

authRoute.post('/quick-login', async (c) => {
  const rl = await ipRateLimit(c, 'quicklogin');
  if (rl) return rl;
  const { userId, displayName } = await c.req.json();
  if (!userId) return c.json({ error: 'Thiếu mã định danh người dùng (userId)!' }, 400);
  const db = createDb(c.env);

  const profileRows = await db.select().from(profilesTable).where(eq(profilesTable.id, userId)).all();
  const userRows = await db.select().from(usersTable).where(eq(usersTable.id, userId)).all();
  let profile = profileRows[0];
  let user = userRows[0];

  // (Removed password123 users-row auto-create — was an account-minting hole.
  //  quick-login now only bootstraps/returns a profile, never a login row.)

  if (!profile) {
    profile = {
      id: userId,
      displayName: displayName || `Kỳ thủ ${userId.substring(0, 5)}`,
      avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${userId}`,
      eloCaro: 1500, eloCoTuong: 1500, eloCoVua: 1500, eloOAnQuan: 1500,
      eloCoCaNgua: 1500, eloDuoiHinhBatChu: 1500, eloNoiChu: 1500, eloDoanTu: 1500,
      honorScore: 100, badges: '[]',
    } as typeof profile;
    await db.insert(profilesTable).values(profile as any);
  }

  const role = user?.role ?? (userId === 'user_a' ? 'admin' : 'user');
  return c.json({ ...profile, role });
});
