// Frontend mirror of worker/src/lib/password.ts validatePassword.
// Keep in sync with the backend policy.
export function validatePassword(pw: string): { ok: boolean; error?: string } {
  if (!pw || pw.length < 8) return { ok: false, error: 'Mật khẩu tối thiểu 8 ký tự!' };
  if (!/[A-Z]/.test(pw)) return { ok: false, error: 'Cần ít nhất 1 chữ HOA!' };
  if (!/[a-z]/.test(pw)) return { ok: false, error: 'Cần ít nhất 1 chữ thường!' };
  if (!/[0-9]/.test(pw)) return { ok: false, error: 'Cần ít nhất 1 chữ số!' };
  return { ok: true };
}

export const PASSWORD_HINT = 'Tối thiểu 8 ký tự, gồm chữ HOA, chữ thường và số.';
