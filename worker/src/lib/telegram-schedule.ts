import type { Bindings } from '../db';
import { scheduledSlot } from '../../../shared/bilac-telegram';
import { tableMessage, recoverUpdates } from './telegram-commands';
import { enqueue, deliver } from './telegram-client';

export async function runTelegramSchedule(env: Bindings, cron: string, scheduledTime: number) {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  const slot = scheduledSlot(cron);
  if (slot) {
    const date = new Date(scheduledTime);
    const localDay = new Date(scheduledTime + 7 * 3600000).toISOString().slice(0, 10);
    const groups = await env.DB.prepare('SELECT tournament_id,chat_id FROM bilac_telegram WHERE enabled=1 AND auto_post=1').all<{ tournament_id: string; chat_id: string }>();
    for (const group of groups.results) {
      try {
        await enqueue(env, `standings:${group.tournament_id}:${localDay}:${slot}`, group.chat_id, { text: await tableMessage(env, group.tournament_id, date) }, group.tournament_id, scheduledTime);
      } catch {
        console.error('Telegram standings scheduling failed', group.tournament_id);
      }
    }
  }
  if (cron === '*/5 * * * *') {
    await recoverUpdates(env);
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM telegram_tokens WHERE expires_at<?').bind(now),
      env.DB.prepare('DELETE FROM telegram_drafts WHERE expires_at<?').bind(now),
      env.DB.prepare('DELETE FROM auth_sessions WHERE expires_at<?').bind(now),
      env.DB.prepare('DELETE FROM telegram_updates WHERE created_at<?').bind(now - 7 * 86400000),
      env.DB.prepare('DELETE FROM telegram_outbox WHERE expires_at<?').bind(now - 30 * 86400000),
    ]);
  }
  await deliver(env);
}
