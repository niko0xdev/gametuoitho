# Plan: Brevo email — verify signup + forgot-password

## Goal
Complete the auth flows with real email:
- **Signup**: strong password (FE+BE) → create unverified user → OTP → email via Brevo → verify → account active + login.
- **Forgot password**: existing OTP flow wired to Brevo (replace `console.log` + remove the `_debugOtp` leak).
- **Security + anti-spam**: OTP hashed + short expiry + attempt cap; per-IP rate-limiting on auth endpoints; strong password policy.

## Stack
- Brevo transactional email: `POST https://api.brevo.com/v3/smtp/email` from the Worker. `BREVO_API_KEY` = secret; `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME` = vars (configured in `wrangler.toml`).
- Cloudflare **Rate Limiting binding** for per-IP anti-spam (native, no D1 writes).

## Password policy (shared FE + BE)
≥ 8 chars, ≥ 1 uppercase, ≥ 1 lowercase, ≥ 1 digit. One validator in `worker/src/lib/password.ts` (BE) + mirror in `src/lib/passwordRules.ts` (FE).

## OTP security
- 6-digit, **SHA-256 hashed** at rest (reuse `sha256Hex`), 10-min expiry.
- Max **5 verify attempts** per OTP (`otp_attempts` column); after that, must request a new OTP.
- Min **60s** between OTP requests for the same email.

## Anti-spam (Rate Limit binding)
`[[unsafe.bindings]] type="ratelimit"` `RATE_LIMITER`, `simple={limit=10, period=60}` (10/min per IP). Applied to: `/api/auth/register`, `/api/auth/forgot-password`, `/api/auth/verify-email`, `/api/auth/reset-password`.

## DB (migration 0003)
`ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0;`
`ALTER TABLE users ADD COLUMN otp_attempts INTEGER DEFAULT 0;`
`ALTER TABLE users ADD COLUMN last_otp_at INTEGER DEFAULT 0;`
(schema in `worker/src/schema.ts` too.)

## Endpoints (worker/src/routes/auth.ts)
- `POST /register` — validate password; create user `email_verified=0`; generate OTP, store hash + expiry + last_otp_at, email via Brevo; return `{ needsVerification: true, email }` (do NOT auto-login).
- `POST /verify-email` `{email, otp}` — check hash + expiry + attempts; on success `email_verified=1`, clear otp; return user (login). On wrong otp, `otp_attempts++`; cap 5.
- `POST /resend-otp` `{email}` — rate-limit (60s), new OTP, email.
- `POST /login` — reject if `email_verified=0` ("Tài khoản chưa xác thực email").
- `POST /forgot-password` — rate-limit; generate OTP, email via Brevo (no more `_debugOtp`).
- `POST /reset-password` — validate new password strength on reset too.

## Brevo helper (`worker/src/lib/email.ts`)
`sendOtpEmail(env, toEmail, displayName, otp)` → Brevo API. Graceful error (Vietnamese message). Dev fallback: if `BREVO_API_KEY` unset, log OTP to console + return success (so local dev works without Brevo).

## Frontend (`src/components/AuthModal.tsx`)
- New `AuthMode`: `verify_email` (after register) — 6-digit input + "Gửi lại mã" (60s countdown).
- Password strength meter + rule hints on register + reset forms; block submit if invalid.
- On successful verify → `onLoginSuccess(user)`.

## Verify (per goal: impl → PR → merge → deploy)
- `tsc` (worker) + `npm run lint` (FE) + `npm run test:worker`.
- Local: `wrangler dev` + curl — register (weak pw rejected, strong ok) → verify-email with wrong OTP (attempts++) → correct OTP → login (unverified login rejected pre-verify).

## User-provided config (after deploy)
- `npx wrangler secret put BREVO_API_KEY`
- `BREVO_SENDER_EMAIL` + `BREVO_SENDER_NAME` in `wrangler.toml [vars]` (a Brevo-verified sender).
