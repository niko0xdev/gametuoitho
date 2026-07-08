// Web Crypto SHA-256, returns lowercase hex digest.
// Async because crypto.subtle.digest is async on Workers runtime.
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Strong password policy (mirrored in src/lib/passwordRules.ts for the FE).
// ≥8 chars, ≥1 uppercase, ≥1 lowercase, ≥1 digit.
export function validatePassword(pw: string): { ok: boolean; error?: string } {
  if (!pw || pw.length < 8) return { ok: false, error: 'Mật khẩu tối thiểu 8 ký tự!' };
  if (!/[A-Z]/.test(pw)) return { ok: false, error: 'Mật khẩu cần ít nhất 1 chữ cái HOA!' };
  if (!/[a-z]/.test(pw)) return { ok: false, error: 'Mật khẩu cần ít nhất 1 chữ cái thường!' };
  if (!/[0-9]/.test(pw)) return { ok: false, error: 'Mật khẩu cần ít nhất 1 chữ số!' };
  return { ok: true };
}

// OTP policy.
export const OTP_TTL_MS = 10 * 60 * 1000;        // 10 minutes
export const OTP_RESEND_MIN_MS = 60 * 1000;       // 60s between requests
export const OTP_MAX_ATTEMPTS = 5;
export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

