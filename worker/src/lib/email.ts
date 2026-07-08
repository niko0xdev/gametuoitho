// worker/src/lib/email.ts
import type { Bindings } from '../db';

// Send an OTP via Resend transactional email. Falls back to a console log when
// RESEND_API_KEY is unset (local dev) so the auth flows still work e2e without
// a Resend account. Production requires MAIL_FROM_EMAIL's domain be verified
// inside Resend (gametuoitho.space → Resend → Domains).
export async function sendOtpEmail(
  env: Bindings,
  toEmail: string,
  displayName: string,
  otp: string,
): Promise<boolean> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[dev OTP — Resend not configured] ${toEmail}: ${otp}`);
    return true;
  }
  const senderEmail = env.MAIL_FROM_EMAIL || 'no-reply@gametuoitho.space';
  const senderName = env.MAIL_FROM_NAME || 'Game Tuổi Thơ';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${senderName} <${senderEmail}>`,
        to: [toEmail],
        subject: `Mã xác thực Game Tuổi Thơ: ${otp}`,
        html:
          `<html><body style="font-family:system-ui,sans-serif;color:#1c1917">` +
          `<h2>Mã xác thực của bạn</h2>` +
          `<p>Xin chào <b>${displayName}</b>,</p>` +
          `<p>Mã OTP của bạn là: <b style="font-size:26px;letter-spacing:4px;color:#ea580c">${otp}</b></p>` +
          `<p>Mã có hiệu lực 10 phút. Nếu bạn không yêu cầu mã này, hãy bỏ qua email.</p>` +
          `<p style="color:#78716c">— Game Tuổi Thơ (gametuoitho.space)</p>` +
          `</body></html>`,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Resend send failed (${res.status}):`, body);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Resend send failed:', err);
    return false;
  }
}
