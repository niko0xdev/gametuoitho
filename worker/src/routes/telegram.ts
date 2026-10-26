import { telegramFormRoute } from './telegram-form';
import { telegramEnabled } from '../lib/telegram-config';
import { Hono } from 'hono';
import type { Bindings } from '../db';
import { sessionUser, sameOrigin } from '../lib/session';
import { sha256Hex } from '../lib/password';
import { memberRole } from '../lib/bilac-actions';
import { deliver, enqueue, telegram } from '../lib/telegram-client';
import { recoverUpdates, tableMessage, type TelegramUpdate } from '../lib/telegram-commands';

export const telegramRoute = new Hono<{ Bindings: Bindings; Variables: { verifiedUserId: string; tournamentId: string; owner: boolean } }>();
telegramRoute.get('/capabilities', c => {
  c.header('Cache-Control', 'no-store');
  return c.json({ enabled: telegramEnabled(c.env) });
});
telegramRoute.use('*', async (c, next) => {
  c.header('Cache-Control', 'private, no-store');
  if (!telegramEnabled(c.env)) return c.json({ error: 'Tính năng Telegram chưa được bật.' }, 404);
  await next();
});
telegramRoute.route('/form', telegramFormRoute);
telegramRoute.post('/webhook', async c => {
  const secret = c.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || c.req.header('X-Telegram-Bot-Api-Secret-Token') !== secret) return c.json({ error: 'Webhook không hợp lệ.' }, 401);
  const raw = await c.req.text();
  if (raw.length > 65536) return c.json({ error: 'Dữ liệu quá lớn.' }, 413);
  let update: TelegramUpdate;
  try { update = JSON.parse(raw); } catch { return c.json({ error: 'JSON không hợp lệ.' }, 400); }
  if (!update || typeof update !== 'object' || !Number.isSafeInteger(update.update_id) || update.update_id < 0) return c.json({ error: 'Update không hợp lệ.' }, 400);
  if (update.message && !update.message.migrate_to_chat_id && !/^\/(start|connect|help|random|score|bxh|addplayer)(@\w+)?(\s|$)/i.test(update.message.text ?? '')) return c.json({ ok: true });
  const chat = update.message?.chat ?? update.callback_query?.message?.chat ?? update.my_chat_member?.chat;
  const actor = update.callback_query?.from ?? update.message?.from;
  const binding = chat ? await c.env.DB.prepare('SELECT binding_id FROM bilac_telegram WHERE chat_id=? AND enabled=1').bind(String(chat.id)).first<{ binding_id: string }>() : null;
  const link = actor ? await c.env.DB.prepare('SELECT link_id FROM telegram_links WHERE telegram_id=?').bind(String(actor.id)).first<{ link_id: string }>() : null;
  const clean = {
    bindingId: binding?.binding_id ?? null,
    linkId: link?.link_id ?? null,
    update_id: update.update_id,
    ...(update.message ? { message: {
      message_id: update.message.message_id,
      text: update.message.text?.slice(0, 4096),
      chat: { id: update.message.chat?.id, type: update.message.chat?.type, title: update.message.chat?.title },
      from: update.message.from ? { id: update.message.from.id, is_bot: update.message.from.is_bot } : undefined,
      sender_chat: update.message.sender_chat ? {} : undefined,
      migrate_to_chat_id: update.message.migrate_to_chat_id,
      reply_to_message: update.message.reply_to_message ? { text: update.message.reply_to_message.text?.slice(0, 4096) } : undefined,
    } } : {}),
    ...(update.callback_query ? { callback_query: {
      id: update.callback_query.id, data: update.callback_query.data,
      from: { id: update.callback_query.from?.id, is_bot: update.callback_query.from?.is_bot },
      message: update.callback_query.message ? { message_id: update.callback_query.message.message_id, chat: { id: update.callback_query.message.chat?.id, type: update.callback_query.message.chat?.type } } : undefined,
    } } : {}),
    ...(update.my_chat_member ? { my_chat_member: { chat: { id: update.my_chat_member.chat?.id, type: update.my_chat_member.chat?.type }, new_chat_member: { status: update.my_chat_member.new_chat_member?.status } } } : {}),
  };
  await c.env.DB.prepare('INSERT OR IGNORE INTO telegram_updates (id,payload,created_at) VALUES (?,?,?)').bind(update.update_id, JSON.stringify(clean), Date.now()).run();
  c.executionCtx.waitUntil(recoverUpdates(c.env).then(() => deliver(c.env)));
  return c.json({ ok: true });
});

telegramRoute.use('/settings/*', async (c, next) => {
  c.header('Cache-Control', 'private, no-store');
  if (!sameOrigin(c)) return c.json({ error: 'Nguồn yêu cầu không hợp lệ.' }, 403);
  const userId = await sessionUser(c);
  if (!userId || (c.req.header('x-user-id') && c.req.header('x-user-id') !== userId)) return c.json({ error: 'Vui lòng đăng xuất rồi đăng nhập lại để dùng Telegram.' }, 401);
  const tournamentId = c.req.header('x-tournament-id') ?? '';
  const role = await memberRole(c.env, tournamentId, userId);
  if (!role) return c.json({ error: 'Bạn cần là thành viên giải đấu.' }, 403);
  c.set('verifiedUserId', userId); c.set('tournamentId', tournamentId); c.set('owner', role === 'owner');
  if (!c.env.TELEGRAM_BOT_TOKEN || !c.env.TELEGRAM_BOT_USERNAME || !c.env.TELEGRAM_WEBHOOK_SECRET) return c.json({ error: 'Telegram chưa được cấu hình trên máy chủ.' }, 503);
  await next();
});

telegramRoute.get('/settings/status', async c => {
  const userId = c.get('verifiedUserId'), tournamentId = c.get('tournamentId');
  const integration = c.get('owner') ? await c.env.DB.prepare('SELECT chat_id,chat_title,enabled,auto_post,health FROM bilac_telegram WHERE tournament_id=?').bind(tournamentId).first() : null;
  const link = await c.env.DB.prepare('SELECT telegram_id FROM telegram_links WHERE user_id=?').bind(userId).first();
  const pending = await c.env.DB.prepare('SELECT hash,purpose,telegram_id,chat_id,chat_title FROM telegram_tokens WHERE user_id=? AND expires_at>? AND telegram_id IS NOT NULL AND (tournament_id=? OR tournament_id IS NULL)')
    .bind(userId, Date.now(), tournamentId).all();
  const failed = c.get('owner') ? (await c.env.DB.prepare("SELECT id,status,error FROM telegram_outbox WHERE tournament_id=? AND status IN ('failed','unknown') ORDER BY due_at DESC LIMIT 5").bind(tournamentId).all()).results : [];
  return c.json({ botUsername: c.env.TELEGRAM_BOT_USERNAME, owner: c.get('owner'), link, integration, pending: pending.results.filter(p => c.get('owner') || p.purpose === 'account'), failed });
});
telegramRoute.post('/settings/token', async c => {
  const { purpose } = await c.req.json<{ purpose: string }>();
  if (!['account', 'group'].includes(purpose)) return c.json({ error: 'Loại liên kết không hợp lệ.' }, 400);
  if (purpose === 'group' && !c.get('owner')) return c.json({ error: 'Chỉ chủ giải được kết nối group.' }, 403);
  const liveLink = purpose === 'group' ? await c.env.DB.prepare('SELECT link_id FROM telegram_links WHERE user_id=?').bind(c.get('verifiedUserId')).first<{ link_id: string }>() : null;
  if (purpose === 'group' && !liveLink) return c.json({ error: 'Hãy liên kết tài khoản Telegram trước.' }, 409);
  const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const userId = c.get('verifiedUserId');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM telegram_tokens WHERE user_id=? AND purpose=?').bind(userId, purpose),
    c.env.DB.prepare('INSERT INTO telegram_tokens (hash,user_id,tournament_id,purpose,expires_at,link_id) VALUES (?,?,?,?,?,?)')
      .bind(await sha256Hex(token), userId, purpose === 'group' ? c.get('tournamentId') : null, purpose, Date.now() + 10 * 60000, liveLink?.link_id ?? null),
  ]);
  return c.json(purpose === 'account' ? { url: `https://t.me/${c.env.TELEGRAM_BOT_USERNAME}?start=${token}` } : { command: `/connect@${c.env.TELEGRAM_BOT_USERNAME} ${token}` });
});
telegramRoute.post('/settings/confirm', async c => {
  const { id } = await c.req.json<{ id: string }>();
  const token = await c.env.DB.prepare('SELECT * FROM telegram_tokens WHERE hash=? AND user_id=? AND expires_at>? AND telegram_id IS NOT NULL')
    .bind(id, c.get('verifiedUserId'), Date.now()).first<{ hash: string; purpose: string; user_id: string; tournament_id: string; telegram_id: string; chat_id: string; chat_title: string; link_id: string | null }>();
  if (!token) return c.json({ error: 'Yêu cầu đã hết hạn.' }, 409);
  if (token.purpose === 'group' && (!c.get('owner') || token.tournament_id !== c.get('tournamentId') || !token.chat_id)) return c.json({ error: 'Bạn không có quyền kết nối group này.' }, 403);
  if (token.purpose === 'account') {
    const occupied = await c.env.DB.prepare('SELECT user_id FROM telegram_links WHERE telegram_id=? AND user_id!=?').bind(token.telegram_id, token.user_id).first();
    if (occupied) return c.json({ error: 'Telegram này đã liên kết tài khoản khác.' }, 409);
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM telegram_links WHERE user_id=? AND EXISTS (SELECT 1 FROM telegram_tokens WHERE hash=?)').bind(token.user_id, id),
      c.env.DB.prepare('INSERT INTO telegram_links (telegram_id,user_id) SELECT ?,? WHERE EXISTS (SELECT 1 FROM telegram_tokens WHERE hash=?)').bind(token.telegram_id, token.user_id, id),
      c.env.DB.prepare('DELETE FROM telegram_tokens WHERE hash=?').bind(id),
    ]);
  } else {
    const admin = await telegram<{ status: string }>(c.env, 'getChatMember', { chat_id: token.chat_id, user_id: Number(token.telegram_id) }).catch(() => null);
    if (!admin || !['creator', 'administrator'].includes(admin.status)) return c.json({ error: 'Không xác minh được quyền quản trị group. Hãy kiểm tra quyền của bạn và bot rồi thử lại.' }, 403);
    const linked = await c.env.DB.prepare('SELECT 1 FROM telegram_links WHERE telegram_id=? AND user_id=? AND link_id=?').bind(token.telegram_id, token.user_id, token.link_id).first();
    if (!linked) return c.json({ error: 'Liên kết tài khoản đã thay đổi. Hãy tạo mã group lại.' }, 409);
    const occupied = await c.env.DB.prepare('SELECT 1 FROM bilac_telegram WHERE chat_id=? AND tournament_id!=?').bind(token.chat_id, token.tournament_id).first();
    if (occupied) return c.json({ error: 'Group đã dùng cho giải khác.' }, 409);
    const bindingId = crypto.randomUUID();
    const results = await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO bilac_telegram (tournament_id,chat_id,chat_title,connected_by,binding_id)
        SELECT t.tournament_id,t.chat_id,t.chat_title,t.user_id,? FROM telegram_tokens t
        JOIN telegram_links l ON l.user_id=t.user_id AND l.telegram_id=t.telegram_id AND l.link_id=t.link_id
        JOIN bilac_tournament_members m ON m.tournament_id=t.tournament_id AND m.user_id=t.user_id AND m.role='owner'
        JOIN users u ON u.id=t.user_id
        WHERE t.hash=? AND t.user_id=? AND t.tournament_id=? AND t.purpose='group'
        AND t.telegram_id=? AND t.chat_id=? AND t.link_id=? AND t.expires_at>?
        ON CONFLICT(tournament_id) DO UPDATE SET chat_id=excluded.chat_id,chat_title=excluded.chat_title,
        connected_by=excluded.connected_by,binding_id=excluded.binding_id,enabled=1,auto_post=1,health=NULL`)
        .bind(bindingId, id, token.user_id, token.tournament_id, token.telegram_id, token.chat_id, token.link_id, Date.now()),
      c.env.DB.prepare('DELETE FROM telegram_drafts WHERE tournament_id=? AND EXISTS (SELECT 1 FROM bilac_telegram WHERE binding_id=?)').bind(token.tournament_id, bindingId),
      c.env.DB.prepare("UPDATE telegram_outbox SET status='cancelled' WHERE tournament_id=? AND status='pending' AND EXISTS (SELECT 1 FROM bilac_telegram WHERE binding_id=?)").bind(token.tournament_id, bindingId),
      c.env.DB.prepare('DELETE FROM telegram_tokens WHERE hash=? AND EXISTS (SELECT 1 FROM bilac_telegram WHERE binding_id=?)').bind(id, bindingId),
    ]);
    if (!results[0].meta.changes) return c.json({ error: 'Quyền hoặc yêu cầu liên kết đã thay đổi. Hãy thử lại.' }, 409);
  }
  return c.json({ success: true });
});
telegramRoute.delete('/settings/link', async c => {
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM telegram_links WHERE user_id=?').bind(c.get('verifiedUserId')),
    c.env.DB.prepare('DELETE FROM telegram_tokens WHERE user_id=?').bind(c.get('verifiedUserId')),
  ]);
  return c.json({ success: true });
});
telegramRoute.post('/settings/config', async c => {
  if (!c.get('owner')) return c.json({ error: 'Chỉ chủ giải được đổi cấu hình.' }, 403);
  const body = await c.req.json<{ autoPost?: boolean; disconnect?: boolean; test?: boolean }>();
  const tid = c.get('tournamentId');
  if (body.disconnect === true) {
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM bilac_telegram WHERE tournament_id=?').bind(tid),
      c.env.DB.prepare('DELETE FROM telegram_drafts WHERE tournament_id=?').bind(tid),
      c.env.DB.prepare('DELETE FROM telegram_tokens WHERE tournament_id=?').bind(tid),
      c.env.DB.prepare("UPDATE telegram_outbox SET status='cancelled' WHERE tournament_id=? AND status='pending'").bind(tid),
    ]);
  } else if (body.test === true) {
    const group = await c.env.DB.prepare('SELECT chat_id,binding_id FROM bilac_telegram WHERE tournament_id=? AND enabled=1').bind(tid).first<{ chat_id: string; binding_id: string }>();
    if (!group) return c.json({ error: 'Chưa kết nối group.' }, 409);
    await enqueue(c.env, `test:${crypto.randomUUID()}`, group.chat_id, { text: await tableMessage(c.env, tid) }, tid, Date.now(), group.binding_id);
    c.executionCtx.waitUntil(deliver(c.env));
  } else if (typeof body.autoPost === 'boolean') {
    await c.env.DB.prepare('UPDATE bilac_telegram SET auto_post=? WHERE tournament_id=?').bind(body.autoPost ? 1 : 0, tid).run();
  } else return c.json({ error: 'Cấu hình không hợp lệ.' }, 400);
  return c.json({ success: true });
});
