import type { Bindings } from '../db';

export function telegramEnabled(env: Bindings): boolean {
  return env.TELEGRAM_ENABLED === 'true' && Boolean(
    env.TELEGRAM_BOT_TOKEN?.trim() && env.TELEGRAM_BOT_USERNAME?.trim() && env.TELEGRAM_WEBHOOK_SECRET?.trim(),
  );
}
export interface TelegramBinding { id: string; chatId: string }
export interface TelegramActorBinding extends TelegramBinding { telegramId: string; linkId: string; groupMember?: boolean }

// Keep binding/link generation checks in the same SQL statement as the mutation.
export const telegramActorSql = `(? IS NULL OR EXISTS (
  SELECT 1 FROM bilac_telegram i JOIN telegram_links l ON l.user_id=? AND l.link_id=?
  WHERE i.tournament_id=? AND i.chat_id=? AND i.binding_id=? AND i.enabled=1
    AND ((?=0 AND l.telegram_id=?) OR (?=1 AND i.connected_by=l.user_id AND EXISTS (
      SELECT 1 FROM bilac_tournament_members m JOIN users u ON u.id=m.user_id
      WHERE m.tournament_id=i.tournament_id AND m.user_id=l.user_id AND m.role='owner'
    )))
))`;
export function telegramActorParams(tournamentId: string, userId: string, actor?: TelegramActorBinding) {
  const group = actor?.groupMember ? 1 : 0;
  return [actor?.id ?? null, userId, actor?.linkId ?? '', tournamentId, actor?.chatId ?? '', actor?.id ?? '', group, actor?.telegramId ?? '', group];
}
