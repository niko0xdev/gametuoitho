// worker/src/lib/email.ts
import type { Bindings } from '../db';

// Send an OTP via Brevo transactional email. Falls back to a console log when
// BREVO_API_KEY is unset (local dev / not-yet-configured) so the auth flows
// still work end-to-end without a Brevo account.
export async function sendOtpEmail(
  env: Bindings,
  toEmail: string,
  displayName: string,
  otp: string,
): Promise<boolean> {
  const apiKey = env.BREVO_API_KEY;
  if (!apiKey) {
    console.log(`[dev OTP — Brevo not configured] ${toEmail}: ${otp}`);
    return true;
  }
  const senderEmail = env.BREVO_SENDER_EMAIL || 'no-reply@gametuoitho.space';
  const senderName = env.BREVO_SENDER_NAME || 'Game Tuổi Thơ';
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: toEmail, name: displayName }],
        subject: `Mã xác thực Game Tuổi Thơ: ${otp}`,
        htmlContent:
          `<html><body style="font-family:system-ui,sans-serif;color:#1c1917">` +
          `<h2>Mã xác thực của bạn</h2>` +
          `<p>Xin chào <b>${displayName}</b>,</p>` +
          `<p>Mã OTP của bạn là: <b style="font-size:26px;letter-spacing:4px;color:#ea580c">${otp}</b></p>` +
          `<p>Mã có hiệu lực 10 phút. Nếu bạn không yêu cầu mã này, hãy bỏ qua email.</p>` +
          `<p style="color:#78716c">— Game Tuổi Thơ (gametuoitho.space)</p>` +
          `</body></html>`,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error('Brevo send failed:', err);
    return false;
  }
}
