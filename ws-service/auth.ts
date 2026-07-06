export async function verifyUser(userId: string | null): Promise<{ ok: true; userId: string } | { ok: false }> {
  if (!userId) return { ok: false };
  const webBase = process.env.WEB_INTERNAL_URL ?? 'http://localhost:3000';
  const secret = process.env.WS_INTERNAL_SECRET ?? '';
  const res = await fetch(`${webBase}/api/internal/verify-user?userId=${encodeURIComponent(userId)}`, {
    headers: { 'x-internal-secret': secret },
  });
  return res.ok ? { ok: true, userId } : { ok: false };
}