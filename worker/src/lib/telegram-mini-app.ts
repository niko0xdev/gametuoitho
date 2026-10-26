const encoder = new TextEncoder();

export async function verifyMiniAppData(raw: string, botToken: string, now = Date.now()): Promise<string | null> {
  if (!raw || raw.length > 16384 || !botToken) return null;
  const fields = new URLSearchParams(raw);
  const entries = [...fields.entries()];
  if (new Set(entries.map(([key]) => key)).size !== entries.length) return null;
  const hash = fields.get('hash') ?? '';
  const date = fields.get('auth_date') ?? '';
  if (!/^[a-f0-9]{64}$/.test(hash) || !/^\d{1,12}$/.test(date)) return null;
  const age = now / 1000 - Number(date);
  if (age < -30 || age > 900) return null;
  const checked = entries.filter(([key]) => key !== 'hash').sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join('\n');
  const webAppKey = await crypto.subtle.importKey('raw', encoder.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const secret = await crypto.subtle.sign('HMAC', webAppKey, encoder.encode(botToken));
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const signature = Uint8Array.from(hash.match(/../g)!, byte => parseInt(byte, 16));
  if (!await crypto.subtle.verify('HMAC', key, signature, encoder.encode(checked))) return null;
  try {
    const user = JSON.parse(fields.get('user') ?? '{}') as { id?: number; is_bot?: boolean };
    return Number.isSafeInteger(user.id) && user.id! > 0 && !user.is_bot ? String(user.id) : null;
  } catch { return null; }
}
