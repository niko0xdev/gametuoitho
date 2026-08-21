import type { Request, Response } from 'express';
import { db, hashPassword } from '../db.ts';
import { validatePassword } from '../../src/lib/passwordRules.ts';

// Dev-only conveniences (OTP echo for the simulated inbox, unverified Google JWT
// decode) must never leak from a production process. The Worker is the production
// authority; Express is legacy dev/offline per CLAUDE.md.
const isDev = process.env.NODE_ENV !== 'production';

export function handleRegister(req: Request, res: Response) {
  const { username, password, email, displayName } = req.body;
  if (!username || !password || !email || !displayName) {
    return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin đăng ký!' });
  }
  const pwCheck = validatePassword(password);
  if (!pwCheck.ok) {
    return res.status(400).json({ error: pwCheck.error || 'Mật khẩu không đủ mạnh!' });
  }

  const trimmedUsername = username.trim().toLowerCase();
  const trimmedEmail = email.trim().toLowerCase();

  if (db.getUserByUsername(trimmedUsername)) {
    return res.status(400).json({ error: 'Tên tài khoản này đã tồn tại!' });
  }

  if (db.getUserByEmail(trimmedEmail)) {
    return res.status(400).json({ error: 'Email này đã được đăng ký!' });
  }

  const userId = 'user_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const passwordHash = hashPassword(password);
  const avatar = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(userId)}`;

  // Worker parity: create the user with a pending email verification OTP. The OTP
  // is echoed back as _debugOtp so the dev "Simulated Mail Inbox" can autofill it;
  // production delivers via email and never echoes it.
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  const userRecord = {
    id: userId,
    username: trimmedUsername,
    email: trimmedEmail,
    passwordHash,
    displayName: displayName.trim(),
    avatar,
    role: 'user' as const,
    otp,
    otpExpires: Date.now() + 5 * 60 * 1000,
    emailVerified: false,
    createdAt: Date.now(),
  };

  const profile = {
    id: userId,
    displayName: displayName.trim(),
    avatar,
    elo: {
      caro: 1500, co_tuong: 1500, co_vua: 1500, o_an_quan: 1500,
      co_ca_ngua: 1500, duoi_hinh_bat_chu: 1500, noi_chu: 1500, doan_tu: 1500
    },
    honorScore: 100,
    badges: []
  };

  db.saveUser(userRecord);
  db.saveProfile(profile);

  console.log(`\n==================================================================`);
  console.log(`🔑 [MÃ OTP XÁC THỰC EMAIL] Gửi tới ${trimmedEmail}: ${otp}`);
  console.log(`==================================================================\n`);

  res.json({
    success: true,
    _debugOtp: isDev ? otp : undefined,
    user: {
      id: userId,
      displayName: profile.displayName,
      username: trimmedUsername,
      email: trimmedEmail,
      role: 'user',
      avatar,
      elo: profile.elo,
      honorScore: profile.honorScore,
      badges: profile.badges
    }
  });
}

export function handleVerifyEmail(req: Request, res: Response) {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ error: 'Vui lòng nhập email và mã OTP!' });
  }
  const user = db.getUserByEmail(email.trim().toLowerCase());
  // Generic error to avoid revealing whether the email is registered.
  const GENERIC = 'Mã OTP không chính xác hoặc đã hết hạn!';
  if (!user) {
    return res.status(400).json({ error: GENERIC });
  }
  if (!user.otp || user.otp !== String(otp).trim() || !user.otpExpires || Date.now() > user.otpExpires) {
    return res.status(400).json({ error: GENERIC });
  }
  user.otp = undefined;
  user.otpExpires = undefined;
  user.emailVerified = true;
  db.saveUser(user);
  const profile = db.getProfile(user.id);
  res.json({
    success: true,
    message: 'Xác thực email thành công!',
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      avatar: user.avatar,
      role: user.role,
      elo: profile?.elo ?? { caro: 1500, co_tuong: 1500, co_vua: 1500, o_an_quan: 1500, co_ca_ngua: 1500, duoi_hinh_bat_chu: 1500, noi_chu: 1500, doan_tu: 1500 },
      honorScore: profile?.honorScore ?? 100,
      badges: profile?.badges ?? []
    }
  });
}

export function handleResendOtp(req: Request, res: Response) {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Vui lòng cung cấp email!' });
  }
  const user = db.getUserByEmail(email.trim().toLowerCase());
  if (!user) {
    return res.status(400).json({ error: 'Không tìm thấy tài khoản!' });
  }
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  user.otp = otp;
  user.otpExpires = Date.now() + 5 * 60 * 1000;
  db.saveUser(user);
  res.json({ success: true, _debugOtp: isDev ? otp : undefined, message: 'Đã gửi lại mã OTP.' });
}

export function handleLogin(req: Request, res: Response) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Vui lòng điền đầy đủ tên tài khoản và mật khẩu!' });
  }

  const input = String(username).trim().toLowerCase();
  const user = db.getUserByEmail(input) ?? db.getUserByUsername(input);
  if (!user) {
    return res.status(400).json({ error: 'Tài khoản không tồn tại!' });
  }

  if (user.isGoogleUser) {
    return res.status(400).json({ error: 'Tài khoản này đăng nhập bằng Google SSO!' });
  }

  const passwordHash = hashPassword(password);
  if (user.passwordHash !== passwordHash) {
    return res.status(400).json({ error: 'Mật khẩu không chính xác!' });
  }
  if (!user.emailVerified) {
    return res.status(403).json({ error: 'Tài khoản chưa xác thực email. Vui lòng kiểm tra hộp thư của bạn.' });
  }

  let profile = db.getProfile(user.id);
  if (!profile) {
    profile = {
      id: user.id,
      displayName: user.displayName,
      avatar: user.avatar,
      elo: { caro: 1500, co_tuong: 1500, co_vua: 1500, o_an_quan: 1500, co_ca_ngua: 1500, duoi_hinh_bat_chu: 1500, noi_chu: 1500, doan_tu: 1500 },
      honorScore: 100,
      badges: []
    };
    db.saveProfile(profile);
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      avatar: user.avatar,
      role: user.role,
      elo: profile.elo,
      honorScore: profile.honorScore,
      badges: profile.badges
    }
  });
}

export function handleGoogleSso(req: Request, res: Response) {
  const { credential, email: bodyEmail, displayName, avatar: bodyAvatar } = req.body;

  // Worker parity: the client posts { credential } (a Google ID JWT). The Worker
  // cryptographically verifies it; in dev we only decode the payload to read the
  // profile (offline, localhost-only). Fall back to a direct {email,...} body for
  // back-compat with older callers/tests.
  let email: string | undefined;
  let name: string | undefined;
  let picture: string | undefined;
  if (credential && isDev) {
    // Dev-only: decode the JWT payload WITHOUT cryptographic verification (the Worker
    // verifies for real in production). Never trust this path outside localhost.
    try {
      const parts = String(credential).split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      email = payload.email;
      name = payload.name || payload.given_name;
      picture = payload.picture;
    } catch { /* malformed credential — fall through to back-compat */ }
  }
  email = email || bodyEmail;
  if (!email) {
    return res.status(400).json({ error: 'Thiếu thông tin Google Account (credential hoặc email)!' });
  }

  const trimmedEmail = email.trim().toLowerCase();
  let user = db.getUserByEmail(trimmedEmail);

  if (!user) {
    const userId = 'user_g_' + Date.now();
    const tempUsername = trimmedEmail.split('@')[0] + '_g';

    user = {
      id: userId,
      username: tempUsername,
      email: trimmedEmail,
      passwordHash: '',
      displayName: name || displayName || trimmedEmail.split('@')[0],
      avatar: picture || bodyAvatar || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(userId)}`,
      role: 'user' as const,
      isGoogleUser: true
    };
    db.saveUser(user);

    const profile = {
      id: userId,
      displayName: user.displayName,
      avatar: user.avatar,
      elo: { caro: 1500, co_tuong: 1500, co_vua: 1500, o_an_quan: 1500, co_ca_ngua: 1500, duoi_hinh_bat_chu: 1500, noi_chu: 1500, doan_tu: 1500 },
      honorScore: 100,
      badges: []
    };
    db.saveProfile(profile);
  }

  const googleProfile = db.getProfile(user.id) || {
    id: user.id,
    displayName: user.displayName,
    avatar: user.avatar,
    elo: { caro: 1500, co_tuong: 1500, co_vua: 1500, o_an_quan: 1500, co_ca_ngua: 1500, duoi_hinh_bat_chu: 1500, noi_chu: 1500, doan_tu: 1500 },
    honorScore: 100,
    badges: []
  };

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      avatar: user.avatar,
      role: user.role,
      elo: googleProfile.elo,
      honorScore: googleProfile.honorScore,
      badges: googleProfile.badges
    }
  });
}

export function handleForgotPassword(req: Request, res: Response) {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Vui lòng cung cấp địa chỉ email!' });
  }

  const user = db.getUserByEmail(email.trim());
  if (!user) {
    return res.status(404).json({ error: 'Không tìm thấy tài khoản nào liên kết với email này!' });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  user.otp = otp;
  user.otpExpires = Date.now() + 5 * 60 * 1000;
  db.saveUser(user);

  console.log(`\n==================================================================`);
  console.log(`🔑 [MÃ OTP RESET MẬT KHẨU] Gửi tới ${user.email}: ${otp}`);
  console.log(`==================================================================\n`);

  res.json({
    success: true,
    message: 'Mã xác thực OTP đã được gửi về email của bạn (vui lòng kiểm tra console log server hoặc sử dụng mã phía dưới)!',
    _debugOtp: isDev ? otp : undefined
  });
}

export function handleResetPassword(req: Request, res: Response) {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) {
    return res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ email, mã OTP và mật khẩu mới!' });
  }

  const user = db.getUserByEmail(email.trim());
  if (!user) {
    return res.status(404).json({ error: 'Không tìm thấy tài khoản!' });
  }

  if (!user.otp || user.otp !== otp.trim()) {
    return res.status(400).json({ error: 'Mã xác thực OTP không chính xác!' });
  }

  if (!user.otpExpires || Date.now() > user.otpExpires) {
    return res.status(400).json({ error: 'Mã OTP đã hết hạn (hiệu lực trong 5 phút)!' });
  }

  const pwCheck = validatePassword(newPassword);
  if (!pwCheck.ok) {
    return res.status(400).json({ error: pwCheck.error || 'Mật khẩu không đủ mạnh!' });
  }

  user.passwordHash = hashPassword(newPassword);
  user.otp = undefined;
  user.otpExpires = undefined;
  db.saveUser(user);

  res.json({
    success: true,
    message: 'Đổi mật khẩu thành công! Bạn có thể sử dụng mật khẩu mới để đăng nhập.'
  });
}

export function handleQuickLogin(req: Request, res: Response) {
  const { userId, displayName } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'Thiếu mã định danh người dùng (userId)!' });
  }

  let profile = db.getProfile(userId);
  let user = db.getUser(userId);

  if (profile && !user) {
    const defaultPasswordHash = hashPassword('password123');
    user = {
      id: userId,
      username: userId,
      email: `${userId}@gametuoitho.space`,
      passwordHash: defaultPasswordHash,
      displayName: profile.displayName,
      avatar: profile.avatar,
      role: userId === 'user_a' ? 'admin' : 'user'
    };
    db.saveUser(user);
  }

  if (!profile) {
    profile = {
      id: userId,
      displayName: displayName || `Kỳ thủ ${userId.substring(0, 5)}`,
      avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${userId}`,
      elo: { caro: 1500, co_tuong: 1500, co_vua: 1500, o_an_quan: 1500, co_ca_ngua: 1500, duoi_hinh_bat_chu: 1500, noi_chu: 1500, doan_tu: 1500 },
      honorScore: 100,
      badges: []
    };
    db.saveProfile(profile);
  }

  const userRole = user?.role || (userId === 'user_a' ? 'admin' : 'user');
  res.json({ ...profile, role: userRole });
}