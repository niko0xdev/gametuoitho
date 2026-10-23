import type { Bindings } from '../db';

export function telegramEnabled(env: Bindings): boolean {
  return env.TELEGRAM_ENABLED === 'true' && Boolean(
    env.TELEGRAM_BOT_TOKEN?.trim() && env.TELEGRAM_BOT_USERNAME?.trim() && env.TELEGRAM_WEBHOOK_SECRET?.trim(),
  );
}
export interface TelegramBinding { id: string; chatId: string }
export interface TelegramActorBinding extends TelegramBinding { telegramId: string; linkId: string }

// Keep binding/link generation checks in the same SQL statement as the mutation.
export const telegramActorSql = `(? IS NULL OR EXISTS (
  SELECT 1 FROM bilac_telegram i JOIN telegram_links l ON l.telegram_id=? AND l.user_id=? AND l.link_id=?
  WHERE i.tournament_id=? AND i.chat_id=? AND i.binding_id=? AND i.enabled=1
))`;
export function telegramActorParams(tournamentId: string, userId: string, actor?: TelegramActorBinding) {
  return [actor?.id ?? null, actor?.telegramId ?? '', userId, actor?.linkId ?? '', tournamentId, actor?.chatId ?? '', actor?.id ?? ''];
}
