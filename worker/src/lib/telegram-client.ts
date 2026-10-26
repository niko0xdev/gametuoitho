import { telegramEnabled } from './telegram-config';
import type { Bindings } from '../db';

export class TelegramError extends Error {
  constructor(public code: number, public retryAfter = 0, public migratedTo?: string, public description = '') {
    super('Telegram request rejected');
  }
}
export function formatMonospaceBlocks(source: string) {
  const entities: Array<{ type: 'pre'; offset: number; length: number }> = [];
  let text = '', cursor = 0;
  for (const match of source.matchAll(/^```\n([\s\S]*?)\n```$/gm)) {
    text += source.slice(cursor, match.index);
    entities.push({ type: 'pre', offset: text.length, length: match[1].length });
    text += match[1]; cursor = match.index! + match[0].length;
  }
  return { text: text + source.slice(cursor), entities };
}

export async function telegram<T>(env: Bindings, method: string, payload: object): Promise<T> {
  if (!telegramEnabled(env)) throw new Error('Telegram is not configured');
  const message = payload as { text?: string; entities?: unknown; parse_mode?: string };
  if (['sendMessage', 'editMessageText'].includes(method) && typeof message.text === 'string' && !message.entities && !message.parse_mode) {
    const formatted = formatMonospaceBlocks(message.text);
    if (formatted.entities.length) payload = { ...payload, ...formatted };
  }
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json() as { ok: boolean; result: T; error_code?: number; description?: string; parameters?: { retry_after?: number; migrate_to_chat_id?: number } };
  if (!data.ok && method === 'editMessageText' && data.error_code === 400 && data.description?.includes('message is not modified')) return data.result;
  if (!data.ok) throw new TelegramError(data.error_code || response.status, data.parameters?.retry_after, data.parameters?.migrate_to_chat_id?.toString(), data.description);
  return data.result;
}

export async function enqueue(env: Bindings, id: string, chatId: string, payload: object, tournamentId: string | null = null, now = Date.now(), bindingId?: string) {
  await env.DB.prepare(`INSERT OR IGNORE INTO telegram_outbox (id,tournament_id,chat_id,payload,due_at,expires_at,binding_id)
    SELECT ?,?,?,?,?,?,? WHERE ? IS NULL OR EXISTS
    (SELECT 1 FROM bilac_telegram WHERE tournament_id=? AND chat_id=? AND binding_id=? AND enabled=1)`)
    .bind(id, tournamentId, chatId, JSON.stringify(payload), now, now + 30 * 60000, bindingId ?? null, tournamentId, tournamentId, chatId, bindingId ?? null).run();
}

export async function deliver(env: Bindings, now = Date.now()) {
  if (!telegramEnabled(env)) return;
  await env.DB.prepare("UPDATE telegram_outbox SET status='cancelled' WHERE status='pending' AND tournament_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM bilac_telegram i WHERE i.tournament_id=telegram_outbox.tournament_id AND i.chat_id=telegram_outbox.chat_id AND i.binding_id=telegram_outbox.binding_id AND i.enabled=1)").run();
  // A crashed send may have reached Telegram. Never blindly replay it.
  await env.DB.prepare("UPDATE telegram_outbox SET status='unknown',error='Delivery interrupted' WHERE status='sending' AND due_at<?").bind(now - 60000).run();
  await env.DB.prepare("UPDATE telegram_outbox SET status='expired' WHERE status='pending' AND expires_at<=?").bind(now).run();
  const jobs = await env.DB.prepare("SELECT * FROM telegram_outbox WHERE status='pending' AND due_at<=? AND expires_at>? ORDER BY due_at LIMIT 20")
    .bind(now, now).all<{ id: string; tournament_id: string | null; chat_id: string; payload: string; attempts: number; binding_id: string | null }>();
  const sentChats = new Set<string>();
  for (const job of jobs.results) {
    if (sentChats.has(job.chat_id)) continue;
    sentChats.add(job.chat_id);
    if (job.tournament_id) {
      const active = await env.DB.prepare('SELECT 1 FROM bilac_telegram WHERE tournament_id=? AND chat_id=? AND binding_id=? AND enabled=1').bind(job.tournament_id, job.chat_id, job.binding_id).first();
      if (!active) {
        await env.DB.prepare("UPDATE telegram_outbox SET status='cancelled' WHERE id=?").bind(job.id).run();
        continue;
      }
    }
    const claim = await env.DB.prepare("UPDATE telegram_outbox SET status='sending',due_at=?,attempts=attempts+1 WHERE id=? AND status='pending' AND (tournament_id IS NULL OR EXISTS (SELECT 1 FROM bilac_telegram i WHERE i.tournament_id=telegram_outbox.tournament_id AND i.chat_id=telegram_outbox.chat_id AND i.binding_id=telegram_outbox.binding_id AND i.enabled=1))")
      .bind(now, job.id).run();
    if (!claim.meta.changes) continue;
    try {
      const result = await telegram<{ message_id: number }>(env, 'sendMessage', { ...JSON.parse(job.payload), chat_id: job.chat_id });
      await env.DB.batch([
        env.DB.prepare("UPDATE telegram_outbox SET status='sent',message_id=?,error=NULL WHERE id=?").bind(result.message_id, job.id),
        env.DB.prepare('UPDATE bilac_telegram SET health=NULL WHERE tournament_id=? AND binding_id=?').bind(job.tournament_id, job.binding_id),
      ]);
    } catch (error) {
      let state = 'unknown', due = now;
      if (error instanceof TelegramError) {
        state = error.code === 429 || error.code >= 500 ? 'pending' : 'failed';
        due += Math.max(error.retryAfter * 1000, Math.min(300000, 1000 * 2 ** job.attempts));
        if (error.migratedTo && job.tournament_id) {
          await env.DB.batch([
            env.DB.prepare('UPDATE bilac_telegram SET chat_id=? WHERE tournament_id=? AND binding_id=? AND chat_id=?').bind(error.migratedTo, job.tournament_id, job.binding_id, job.chat_id),
            env.DB.prepare('UPDATE telegram_outbox SET chat_id=? WHERE id=?').bind(error.migratedTo, job.id),
          ]);
          state = 'pending';
        }
      }
      if (job.attempts >= 4 && state === 'pending') state = 'failed';
      const reason = error instanceof TelegramError ? `Telegram ${error.code}` : 'Delivery uncertain; inspect the group before resending';
      await env.DB.batch([
        env.DB.prepare('UPDATE telegram_outbox SET status=?,due_at=?,error=? WHERE id=?').bind(state, due, reason, job.id),
        env.DB.prepare('UPDATE bilac_telegram SET health=? WHERE tournament_id=? AND binding_id=?').bind(reason, job.tournament_id, job.binding_id),
      ]);
    }
  }
}
