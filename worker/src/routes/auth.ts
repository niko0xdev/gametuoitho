// worker/src/routes/auth.ts
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Bindings } from '../db';
import { createDb } from '../db';
import { usersTable, profilesTable } from '../schema';
import { sha256Hex } from '../lib/password';
import { jwtVerify, createRemoteJWKSet } from 'jose';

// Google OIDC public keys (cached by jose). Used to verify ID tokens issued by
// Google Sign In. Fetched from https://www.googleapis.com/oauth2/v3/certs.
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export const authRoute = new Hono<{ Bindings: Bindings }>();

authRoute.post('/register', async (c) => {
  const { username, password, email, displayName } = await c.req.json();
  if (!username || !password || !email || !displayName) {
    return c.json({ error: 'Vui lòng nhập đầy đủ thông tin đăng ký!' }, 400);
  }
  const tu = username.trim().toLowerCase();
  const te = email.trim().toLowerCase();
  const db = createDb(c.env);

  const existing = await db.select().from(usersTable).where(eq(usersTable.username, tu)).all();
  if (existing.length) return c.json({ error: 'Tên tài khoản này đã tồn tại!' }, 400);

  const byEmail = await db.select().from(usersTable).where(eq(usersTable.email, te)).all();
  if (byEmail.length) return c.json({ error: 'Email này đã được đăng ký!' }, 400);

  const userId = 'user_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const passwordHash = await sha256Hex(password);
  const avatar = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(userId)}`;

  await db.insert(usersTable).values({
    id: userId,
    username: tu,
    email: te,
    passwordHash,
    displayName: displayName.trim(),
    avatar,
    role: 'user',
  });

  await db.insert(profilesTable).values({
    id: userId,
    displayName: displayName.trim(),
    avatar,
    eloCaro: 1500,
    eloCoTuong: 1500,
    eloCoVua: 1500,
    eloOAnQuan: 1500,
    eloCoCaNgua: 1500,
    eloDuoiHinhBatChu: 1500,
    eloNoiChu: 1500,
    eloDoanTu: 1500,
    honorScore: 100,
    badges: '[]',
  });

  return c.json({
    success: true,
    user: { id: userId, displayName: displayName.trim(), username: tu, email: te, role: 'user', avatar },
  });
});

authRoute.post('/login', async (c) => {
  const { username, password } = await c.req.json();
  if (!username || !password) {
    return c.json({ error: 'Vui lòng điền đầy đủ tên tài khoản và mật khẩu!' }, 400);
  }
  const db = createDb(c.env);
  const rows = await db.select().from(usersTable).where(eq(usersTable.username, username)).all();
  const user = rows[0];
  if (!user) return c.json({ error: 'Tài khoản không tồn tại!' }, 400);
  if (user.isGoogleUser) return c.json({ error: 'Tài khoản này đăng nhập bằng Google SSO!' }, 400);

  const hash = await sha256Hex(password);
  if (user.passwordHash !== hash) return c.json({ error: 'Mật khẩu không chính xác!' }, 400);

  return c.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      avatar: user.avatar,
      role: user.role,
    },
  });
});

authRoute.post('/google-sso', async (c) => {
  const { credential } = await c.req.json();
  if (!credential) return c.json({ error: 'Thiếu Google credential!' }, 400);
  if (!c.env.GOOGLE_CLIENT_ID) {
    return c.json({ error: 'Chưa cấu hình GOOGLE_CLIENT_ID trên Worker!' }, 500);
  }

  // Verify the Google ID token (signature via JWKS + iss/aud/exp claims).
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
      id: userId,
      username: tempUsername,
      email,
      passwordHash: '',
      displayName,
      avatar,
      role: 'user',
      isGoogleUser: 1,
    });
    await db.insert(profilesTable).values({
      id: userId,
      displayName,
      avatar,
      eloCaro: 1500, eloCoTuong: 1500, eloCoVua: 1500, eloOAnQuan: 1500,
      eloCoCaNgua: 1500, eloDuoiHinhBatChu: 1500, eloNoiChu: 1500, eloDoanTu: 1500,
      honorScore: 100,
      badges: '[]',
    });
    user = { id: userId, username: tempUsername, email, displayName, avatar, role: 'user' } as typeof user;
  }

  return c.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      avatar: user.avatar,
      role: user.role,
    },
  });
});

authRoute.post('/forgot-password', async (c) => {
  const { email } = await c.req.json();
  if (!email) return c.json({ error: 'Vui lòng cung cấp địa chỉ email!' }, 400);
  const db = createDb(c.env);
  const rows = await db.select().from(usersTable).where(eq(usersTable.email, email.trim())).all();
  const user = rows[0];
  if (!user) return c.json({ error: 'Không tìm thấy tài khoản nào liên kết với email này!' }, 404);

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = Date.now() + 5 * 60 * 1000;

  await db.update(usersTable)
    .set({ otp, otpExpires: expires })
    .where(eq(usersTable.id, user.id));

  console.log(`OTP for ${user.email}: ${otp}`);

  return c.json({
    success: true,
    message: 'Mã xác thực OTP đã được gửi về email của bạn (kiểm tra console log server)!',
    _debugOtp: otp,
  });
});

authRoute.post('/reset-password', async (c) => {
  const { email, otp, newPassword } = await c.req.json();
  if (!email || !otp || !newPassword) {
    return c.json({ error: 'Vui lòng cung cấp đầy đủ email, mã OTP và mật khẩu mới!' }, 400);
  }
  const db = createDb(c.env);
  const rows = await db.select().from(usersTable).where(eq(usersTable.email, email.trim())).all();
  const user = rows[0];
  if (!user) return c.json({ error: 'Không tìm thấy tài khoản!' }, 404);
  if (!user.otp || user.otp !== otp.trim()) return c.json({ error: 'Mã xác thực OTP không chính xác!' }, 400);
  if (!user.otpExpires || Date.now() > user.otpExpires) return c.json({ error: 'Mã OTP đã hết hạn (hiệu lực trong 5 phút)!' }, 400);

  const passwordHash = await sha256Hex(newPassword);
  await db.update(usersTable)
    .set({ passwordHash, otp: null, otpExpires: null })
    .where(eq(usersTable.id, user.id));

  return c.json({ success: true, message: 'Đổi mật khẩu thành công! Bạn có thể sử dụng mật khẩu mới để đăng nhập.' });
});

authRoute.post('/quick-login', async (c) => {
  const { userId, displayName } = await c.req.json();
  if (!userId) return c.json({ error: 'Thiếu mã định danh người dùng (userId)!' }, 400);
  const db = createDb(c.env);

  const profileRows = await db.select().from(profilesTable).where(eq(profilesTable.id, userId)).all();
  const userRows = await db.select().from(usersTable).where(eq(usersTable.id, userId)).all();
  let profile = profileRows[0];
  let user = userRows[0];

  if (profile && !user) {
    const passwordHash = await sha256Hex('password123');
    user = {
      id: userId, username: userId, email: `${userId}@gametuoitho.space`,
      passwordHash, displayName: profile.displayName, avatar: profile.avatar,
      role: userId === 'user_a' ? 'admin' : 'user',
    } as typeof user;
    await db.insert(usersTable).values(user as any);
  }

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
