import type { Bindings } from '../db';
import { telegram } from './telegram-client';

export class TelegramGroupAccessError extends Error {
  constructor(message: string, public status: 403 | 503 = 403) { super(message); }
}
export async function groupRandomIdentity(env: Bindings, scope: { tournament_id: string; chat_id: string; binding_id: string }, telegramId: string) {
  const owner = await env.DB.prepare(`SELECT i.connected_by AS userId,l.link_id AS linkId FROM bilac_telegram i
    JOIN bilac_tournament_members m ON m.tournament_id=i.tournament_id AND m.user_id=i.connected_by AND m.role='owner'
    JOIN users u ON u.id=m.user_id JOIN telegram_links l ON l.user_id=m.user_id
    WHERE i.tournament_id=? AND i.chat_id=? AND i.binding_id=? AND i.enabled=1`)
    .bind(scope.tournament_id, scope.chat_id, scope.binding_id).first<{ userId: string; linkId: string }>();
  if (!owner) throw new TelegramGroupAccessError('Liên kết group hoặc quyền chủ giải đã thay đổi. Hãy nhờ chủ giải kết nối lại.');
  let member: { status: string; is_member?: boolean; user: { id: number; is_bot?: boolean } };
  try { member = await telegram(env, 'getChatMember', { chat_id: scope.chat_id, user_id: Number(telegramId) }); }
  catch { throw new TelegramGroupAccessError('Chưa xác minh được thành viên group. Kiểm tra bot có quyền quản trị rồi thử lại.', 503); }
  if (String(member.user?.id) !== telegramId || member.user?.is_bot || !(['creator','administrator','member'].includes(member.status) || (member.status === 'restricted' && member.is_member === true))) throw new TelegramGroupAccessError('Bạn cần là thành viên hiện tại của group đã kết nối với giải này.');
  return { ...owner, groupMember: true as const };
}
