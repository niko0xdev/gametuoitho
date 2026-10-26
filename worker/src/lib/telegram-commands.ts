import { telegramEnabled, telegramActorSql, telegramActorParams } from './telegram-config';
import type { Bindings } from '../db';
import { sha256Hex } from './password';
import { currentSeason, standings, renderStandings, scoreInput, type RankingPlayer } from '../../../shared/bilac-telegram';
import { createBiLacMatch, memberRole, saveBiLacScore, cancelBiLacMatch, type StoredMatch } from './bilac-actions';
import { enqueue, telegram, TelegramError } from './telegram-client';

interface Actor { id: number; is_bot?: boolean }
interface Message { message_id: number; text?: string; chat: { id: number; type: string; title?: string }; from?: Actor; sender_chat?: object; reply_to_message?: { text?: string }; migrate_to_chat_id?: number }
export interface TelegramUpdate { bindingId?: string | null; linkId?: string | null; update_id: number; message?: Message; callback_query?: { id: string; from: Actor; data?: string; message?: Message }; my_chat_member?: { chat: Message['chat']; new_chat_member: { status: string } } }
interface Integration { tournament_id: string; chat_id: string; enabled: number; binding_id: string }
interface Draft { id: string; tournament_id: string; chat_id: string; telegram_id: string; kind: string; payload: string; revision: number; expires_at: number; consumed: number; decision: string | null; binding_id: string; user_id: string; link_id: string }
interface Selection { players: RankingPlayer[]; selected: string[]; page: number }
class CommandError extends Error {}

export async function tableMessage(env: Bindings, tournamentId: string, date = new Date()) {
  const tournament = await env.DB.prepare('SELECT name,slug FROM bilac_tournaments WHERE id=?').bind(tournamentId).first<{ name: string; slug: string | null }>();
  if (!tournament) throw new CommandError('Giải không còn tồn tại.');
  const players = (await env.DB.prepare('SELECT id,name FROM bilac_players WHERE tournament_id=? ORDER BY rowid').bind(tournamentId).all<RankingPlayer>()).results;
  const matches = (await env.DB.prepare('SELECT * FROM bilac_matches WHERE tournament_id=?').bind(tournamentId).all<StoredMatch>()).results;
  const season = currentSeason(date);
  const rows = standings(players, matches.map(m => ({ ...m, team1: JSON.parse(m.team1), team2: JSON.parse(m.team2), weekLabel: m.week_label })), season);
  const url = tournament.slug ? `${env.APP_URL}/bilac/${tournament.slug}` : env.APP_URL;
  return renderStandings(tournament.name, season, rows, url) + `\nCập nhật: ${date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`;
}

async function linkedUser(env: Bindings, telegramId: string) {
  return (await env.DB.prepare('SELECT user_id FROM telegram_links WHERE telegram_id=?').bind(telegramId).first<{ user_id: string }>())?.user_id;
}
async function authorised(env: Bindings, tournamentId: string, telegramId: string) {
  const userId = await linkedUser(env, telegramId);
  if (!userId || !await memberRole(env, tournamentId, userId)) throw new CommandError('Hãy liên kết tài khoản trên web và tham gia giải trước nhé!');
  const link = await env.DB.prepare('SELECT link_id FROM telegram_links WHERE telegram_id=? AND user_id=?').bind(telegramId, userId).first<{ link_id: string }>();
  if (!link?.link_id) throw new CommandError('Liên kết tài khoản đã thay đổi. Hãy thử lại.');
  return { userId, linkId: link.link_id };
}
async function newDraft(env: Bindings, id: string, integration: Integration, telegramId: string, kind: string, payload: unknown, identity: { userId: string; linkId: string }, ttlMs = 10 * 60000) {
  await env.DB.prepare(`INSERT OR IGNORE INTO telegram_drafts (id,tournament_id,chat_id,telegram_id,kind,payload,expires_at,binding_id,user_id,link_id)
    SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${telegramActorSql}`).bind(id, integration.tournament_id, integration.chat_id, telegramId, kind, JSON.stringify(payload), Date.now() + ttlMs, integration.binding_id, identity.userId, identity.linkId,
      ...telegramActorParams(integration.tournament_id, identity.userId, { id: integration.binding_id, chatId: integration.chat_id, telegramId, linkId: identity.linkId })).run();
}
interface Button { text: string; callback_data: string; style?: 'primary' | 'success' | 'danger' }
function selectionMessage(id: string, revision: number, data: Selection) {
  const start = data.page * 8;
  const options: Button[] = data.players.slice(start, start + 8).map((p, i) => ({ text: `${data.selected.includes(p.id) ? '☑' : '☐'} ${p.name.slice(0, 28)}`, callback_data: `sel:${id}:${revision}:${start + i}:${data.selected.includes(p.id) ? 0 : 1}` }));
  const buttons: Button[][] = [];
  for (let i = 0; i < options.length; i += 2) buttons.push(options.slice(i, i + 2));
  buttons.push([{ text: '☑ Chọn tất cả', callback_data: `all:${id}:${revision}:1` }, { text: '☐ Bỏ chọn', callback_data: `all:${id}:${revision}:0` }]);
  const nav: Button[] = [];
  if (data.page > 0) nav.push({ text: '← Trước', callback_data: `page:${id}:${revision}:${data.page - 1}` });
  if (start + 8 < data.players.length) nav.push({ text: 'Sau →', callback_data: `page:${id}:${revision}:${data.page + 1}` });
  if (nav.length) buttons.push(nav);
  buttons.push([{ text: `🎲 Chia đội · ${data.selected.length} người`, callback_data: `go:${id}:${revision}`, style: 'primary' }]);
  const names = data.players.filter(p => data.selected.includes(p.id)).map(p => p.name.slice(0, 28));
  const summary = names.slice(0, 12).join(', ') + (names.length > 12 ? `, +${names.length - 12} người` : '');
  return { text: `🎲 CHỌN NGƯỜI THAM GIA\n\n${summary ? `Đã chọn ${data.selected.length} người: ${summary}` : 'Chưa chọn ai. Chạm vào ô cạnh tên để chọn.'}\n\nChọn xong → bấm Chia đội. Chưa bấm thì chưa tạo trận.`, reply_markup: { inline_keyboard: buttons } };
}
function matchButtons(id: string) {
  return { inline_keyboard: [
    [{ text: '🔵 A thắng', callback_data: `wa:${id}:0`, style: 'primary' }, { text: '🔴 B thắng', callback_data: `wb:${id}:0`, style: 'danger' }],
    [{ text: '✕ Huỷ trận', callback_data: `cx:${id}:0` }],
  ] as Button[][] };
}
async function matchText(env: Bindings, match: StoredMatch) {
  const players = (await env.DB.prepare('SELECT id,name FROM bilac_players WHERE tournament_id=?').bind(match.tournament_id).all<RankingPlayer>()).results;
  const names = new Map(players.map(p => [p.id, p.name]));
  const team = (json: string) => {
    const ids = JSON.parse(json) as string[];
    return ids.slice(0, 12).map(id => (names.get(id) ?? '?').slice(0, 40)).join(', ') + (ids.length > 12 ? `, +${ids.length - 12} người` : '');
  };
  return `⚽ ${match.status === 'PLAYING' ? 'TRẬN ĐANG CHƠI' : 'TRẬN ĐÃ KẾT THÚC'}\nTrận #${match.id}\n\nĐội A: ${team(match.team1)}\nĐội B: ${team(match.team2)}${match.benched ? `\nDự bị: ${names.get(match.benched)}` : ''}\n\nTỉ số: ${match.score1} – ${match.score2}\nThắng nhanh: 7–6 / 6–7. Hoặc reply /score@${env.TELEGRAM_BOT_USERNAME} 10 7 để nhập điểm.`;
}

async function callback(env: Bindings, update: TelegramUpdate) {
  const cb = update.callback_query!;
  if (!cb.message || cb.from.is_bot || !['group', 'supergroup'].includes(cb.message.chat.type)) return;
  const [action, id, revisionRaw, value, selected] = (cb.data ?? '').split(':');
  if (!['sel', 'page', 'all', 'go', 'save', 'finish', 'add', 'wa', 'wb', 'cx', 'cancel', 'dismiss'].includes(action)) return;
  const draft = await env.DB.prepare('SELECT * FROM telegram_drafts WHERE id=?').bind(id).first<Draft>();
  if (!draft || draft.chat_id !== String(cb.message.chat.id) || (draft.kind !== 'match' && draft.telegram_id !== String(cb.from.id)) || draft.expires_at < Date.now()) throw new CommandError('Nút này hết hạn hoặc dành cho người khác. Hãy chạy lệnh lại.');
  const integration = await env.DB.prepare('SELECT * FROM bilac_telegram WHERE tournament_id=? AND chat_id=? AND binding_id=? AND enabled=1').bind(draft.tournament_id, draft.chat_id, draft.binding_id).first<Integration>();
  if (!integration || (update.bindingId !== undefined && update.bindingId !== draft.binding_id)) throw new CommandError('Group đã ngắt kết nối hoặc đổi phiên liên kết.');
  const identity = await authorised(env, draft.tournament_id, String(cb.from.id));
  if ((draft.kind !== 'match' && (identity.userId !== draft.user_id || identity.linkId !== draft.link_id)) || (update.linkId !== undefined && identity.linkId !== update.linkId)) throw new CommandError('Liên kết tài khoản đã thay đổi. Hãy chạy lệnh mới.');
  const userId = identity.userId;
  const actor = { id: draft.binding_id, chatId: draft.chat_id, telegramId: String(cb.from.id), linkId: identity.linkId };
  if (draft.consumed) return;
  if (draft.kind === 'match' && ['wa', 'wb', 'cx'].includes(action)) {
    const matchId = JSON.parse(draft.payload).matchId as string;
    const match = await env.DB.prepare("SELECT * FROM bilac_matches WHERE id=? AND tournament_id=? AND status='PLAYING'").bind(matchId, draft.tournament_id).first<StoredMatch>();
    if (!match) throw new CommandError('Trận đã kết thúc hoặc được huỷ. Dùng /score để xem trận đang chơi.');
    const confirmation = 'q' + update.update_id.toString(36);
    const cancelling = action === 'cx';
    const scores = action === 'wa' ? [7, 6] : [6, 7];
    await newDraft(env, confirmation, integration, String(cb.from.id), cancelling ? 'cancel' : 'score', { match, scores, sourceMessageId: cb.message.message_id }, identity);
    const preview = cancelling ? 'Huỷ trận này? Trận sẽ không được tính vào BXH.' : `Ghi nhận ${action === 'wa' ? 'đội A thắng 7–6' : 'đội B thắng 6–7'} và kết thúc trận?`;
    await enqueue(env, `quick:${confirmation}`, draft.chat_id, {
      text: `${await matchText(env, match)}\n\n${preview}`,
      reply_markup: { inline_keyboard: [[{ text: cancelling ? 'Xác nhận huỷ trận' : 'Xác nhận kết quả', callback_data: `${cancelling ? 'cancel' : 'finish'}:${confirmation}:0`, style: cancelling ? 'danger' : 'success' }, { text: 'Quay lại', callback_data: `dismiss:${confirmation}:0` }]] },
    }, draft.tournament_id, Date.now(), draft.binding_id);
    return;
  }
  if (action === 'dismiss' && ['score', 'cancel'].includes(draft.kind)) {
    const dismissed = await env.DB.prepare('UPDATE telegram_drafts SET consumed=1 WHERE id=? AND consumed=0 AND decision IS NULL').bind(id).run();
    if (!dismissed.meta.changes) throw new CommandError('Thao tác đang được xác nhận hoặc đã hoàn tất.');
    await telegram(env, 'editMessageText', { chat_id: draft.chat_id, message_id: cb.message.message_id, text: 'Đã bỏ qua. Trận đấu giữ nguyên.', reply_markup: { inline_keyboard: [] } });
    return;
  }
  if (draft.revision !== Number(revisionRaw)) {
    if (draft.kind === 'random' && !draft.decision) {
      await telegram(env, 'editMessageText', { chat_id: draft.chat_id, message_id: cb.message.message_id, ...selectionMessage(id, draft.revision, JSON.parse(draft.payload)) });
      return;
    }
    throw new CommandError('Danh sách đã thay đổi. Dùng nút trong bản mới nhất nhé!');
  }
  const data = JSON.parse(draft.payload);
  if (['sel', 'page', 'all'].includes(action) && draft.kind === 'random') {
    const selection = data as Selection;
    if (action === 'sel') {
      const player = selection.players[Number(value)];
      if (!player) throw new CommandError('Người chơi không hợp lệ.');
      selection.selected = selection.selected.filter(p => p !== player.id);
      if (selected === '1') selection.selected.push(player.id);
    } else if (action === 'all') selection.selected = value === '1' ? selection.players.map(p => p.id) : [];
    else selection.page = Math.min(Math.max(0, Number(value) || 0), Math.max(0, Math.ceil(selection.players.length / 8) - 1));
    const result = await env.DB.prepare('UPDATE telegram_drafts SET payload=?,revision=revision+1 WHERE id=? AND revision=? AND consumed=0 AND decision IS NULL')
      .bind(JSON.stringify(selection), id, draft.revision).run();
    if (result.meta.changes) {
      await telegram(env, 'editMessageText', { chat_id: draft.chat_id, message_id: cb.message.message_id, ...selectionMessage(id, draft.revision + 1, selection) });
    }
    return;
  }
  if (action === 'go' && draft.kind === 'random' && (data as Selection).selected.length < 2) throw new CommandError('Chọn ít nhất 2 người trước khi chia đội nhé!');
  const lock = await env.DB.prepare('UPDATE telegram_drafts SET decision=? WHERE id=? AND revision=? AND consumed=0 AND (decision IS NULL OR decision=?)')
    .bind(action, id, draft.revision, action).run();
  if (!lock.meta.changes) throw new CommandError('Thao tác đã được xác nhận hoặc thay đổi.');
  let text: string;
  let replyMarkup: { inline_keyboard: Button[][] } | undefined;
  if (action === 'go' && draft.kind === 'random') {
    let match: StoredMatch;
    try { match = await createBiLacMatch(env, draft.tournament_id, userId, (data as Selection).selected, `tg-${id}`, actor); }
    catch (error) {
      await env.DB.prepare('UPDATE telegram_drafts SET decision=NULL WHERE id=? AND consumed=0').bind(id).run();
      throw error;
    }
    text = await matchText(env, match);
    await newDraft(env, 'm' + id, integration, String(cb.from.id), 'match', { matchId: match.id }, identity, 24 * 3600000);
    replyMarkup = matchButtons('m' + id);
  } else if ((action === 'save' || action === 'finish') && draft.kind === 'score') {
    const match = data.match as StoredMatch;
    await saveBiLacScore(env, draft.tournament_id, userId, match, scoreInput(String(data.scores[0]), String(data.scores[1])), action === 'finish', `tg-${id}`, actor);
    text = `✅ Trận #${match.id}: A ${data.scores[0]} – ${data.scores[1]} B\n${action === 'finish' || match.status === 'FINISHED' ? 'Đã kết thúc trận.' : 'Đã lưu điểm, trận vẫn đang chơi.'}`;
  } else if (action === 'cancel' && draft.kind === 'cancel') {
    const match = data.match as StoredMatch;
    await cancelBiLacMatch(env, draft.tournament_id, userId, match, `tg-${id}`, actor);
    text = `✕ Đã huỷ trận #${match.id}. Trận không được tính vào BXH.`;
  } else if (action === 'add' && draft.kind === 'player') {
    const name = String(data.name);
    const playerId = 'tg-player-' + (await sha256Hex(draft.tournament_id + ':' + name.toLocaleLowerCase('vi'))).slice(0, 24);
    const names = (await env.DB.prepare('SELECT id,name FROM bilac_players WHERE tournament_id=?').bind(draft.tournament_id).all<RankingPlayer>()).results;
    const duplicate = names.find(p => p.name.normalize('NFC').toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi'));
    if (duplicate && duplicate.id !== playerId) throw new CommandError('Tên người chơi đã có trong giải.');
    await env.DB.prepare(`INSERT OR IGNORE INTO bilac_players (id,name,avatar,tournament_id)
      SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM bilac_players WHERE tournament_id=? AND lower(name)=lower(?))
      AND EXISTS (SELECT 1 FROM bilac_tournament_members m JOIN users u ON u.id=m.user_id WHERE m.tournament_id=? AND m.user_id=?) AND ${telegramActorSql}`)
      .bind(playerId, name, `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(name)}`, draft.tournament_id, draft.tournament_id, name, draft.tournament_id, userId, ...telegramActorParams(draft.tournament_id, userId, actor)).run();
    const created = await env.DB.prepare('SELECT 1 FROM bilac_players WHERE id=?').bind(playerId).first();
    if (!created) throw new CommandError('Tên người chơi đã có trong giải.');
    text = `✅ Đã thêm ${name} vào giải. Dùng /random@${env.TELEGRAM_BOT_USERNAME} để chia đội.`;
  } else throw new CommandError('Thao tác không hợp lệ.');
  if (typeof data.sourceMessageId === 'number' && ['score', 'cancel'].includes(draft.kind)) {
    await telegram(env, 'editMessageText', { chat_id: draft.chat_id, message_id: data.sourceMessageId, text, reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
    await telegram(env, 'editMessageReplyMarkup', { chat_id: draft.chat_id, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
  }
  await enqueue(env, `draft:${id}`, draft.chat_id, { text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }, draft.tournament_id, Date.now(), draft.binding_id);
  if (draft.kind === 'random') await telegram(env, 'editMessageText', { chat_id: draft.chat_id, message_id: cb.message.message_id, text: '✅ Đã chia đội. Xem thẻ trận và các nút thắng/huỷ bên dưới.', reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
  await env.DB.prepare('UPDATE telegram_drafts SET consumed=1 WHERE id=?').bind(id).run();
}

async function message(env: Bindings, update: TelegramUpdate) {
  const m = update.message!;
  if (!m.from || m.from.is_bot || m.sender_chat) return;
  const chatId = String(m.chat.id), telegramId = String(m.from.id);
  const send = (text: string, extra = {}, integration: Integration | null = null) => enqueue(env, `update:${update.update_id}`, chatId, { text, ...extra }, integration?.tournament_id ?? null, Date.now(), integration?.binding_id);
  if (m.migrate_to_chat_id) {
    await env.DB.prepare('UPDATE bilac_telegram SET chat_id=? WHERE chat_id=? AND (?=1 OR binding_id=?)').bind(String(m.migrate_to_chat_id), chatId, update.bindingId === undefined ? 1 : 0, update.bindingId ?? null).run();
    return;
  }
  const raw = m.text?.trim() ?? '';
  const [command, ...args] = raw.split(/\s+/);
  const [verb, target] = command.toLowerCase().split('@');
  if (!verb.startsWith('/') || (target && target !== env.TELEGRAM_BOT_USERNAME?.toLowerCase())) return;
  if (verb === '/start' && m.chat.type === 'private') {
    const hash = await sha256Hex(args[0] || '');
    const token = await env.DB.prepare("SELECT * FROM telegram_tokens WHERE hash=? AND purpose='account' AND expires_at>?").bind(hash, Date.now()).first<{ user_id: string; telegram_id: string | null }>();
    if (!token || (token.telegram_id && token.telegram_id !== telegramId)) throw new CommandError('Link hết hạn. Hãy tạo lại trên web.');
    await env.DB.prepare('UPDATE telegram_tokens SET telegram_id=? WHERE hash=? AND (telegram_id IS NULL OR telegram_id=?)').bind(telegramId, hash, telegramId).run();
    await send('Mở lại web, kiểm tra Telegram ID và bấm Xác nhận liên kết để hoàn tất.');
    return;
  }
  if (m.chat.type !== 'group' && m.chat.type !== 'supergroup') return;
  if (verb === '/connect') {
    const hash = await sha256Hex(args[0] || '');
    const token = await env.DB.prepare("SELECT * FROM telegram_tokens WHERE hash=? AND purpose='group' AND expires_at>?").bind(hash, Date.now()).first<{ user_id: string; tournament_id: string; link_id: string }>();
    const liveLink = await env.DB.prepare('SELECT user_id,link_id FROM telegram_links WHERE telegram_id=?').bind(telegramId).first<{ user_id: string; link_id: string }>();
    if (!token || !liveLink || liveLink.link_id !== token.link_id || liveLink.user_id !== token.user_id || await memberRole(env, token.tournament_id, token.user_id) !== 'owner') throw new CommandError('Mã kết nối không hợp lệ, hoặc bạn chưa liên kết tài khoản chủ giải.');
    let admin: { status: string };
    try { admin = await telegram<{ status: string }>(env, 'getChatMember', { chat_id: chatId, user_id: m.from.id }); }
    catch (error) {
      if (error instanceof TelegramError && [400, 403].includes(error.code)) throw new CommandError('Hãy thêm bot làm quản trị viên group rồi thử kết nối lại.');
      throw error;
    }
    if (!['creator', 'administrator'].includes(admin.status)) throw new CommandError('Chỉ quản trị viên group mới kết nối được.');
    const occupied = await env.DB.prepare('SELECT tournament_id FROM bilac_telegram WHERE chat_id=?').bind(chatId).first<{ tournament_id: string }>();
    if (occupied && occupied.tournament_id !== token.tournament_id) throw new CommandError('Group đã kết nối với giải khác.');
    // Stage the destination, then require confirmation in the verified owner session.
    const staged = await env.DB.prepare(`UPDATE telegram_tokens SET telegram_id=?,chat_id=?,chat_title=? WHERE hash=? AND expires_at>?
      AND (chat_id IS NULL OR chat_id=?) AND link_id=?
      AND EXISTS (SELECT 1 FROM telegram_links WHERE telegram_id=? AND user_id=? AND link_id=?)
      AND EXISTS (SELECT 1 FROM bilac_tournament_members WHERE tournament_id=? AND user_id=? AND role='owner')`)
      .bind(telegramId, chatId, (m.chat.title ?? chatId).slice(0, 150), hash, Date.now(), chatId, liveLink.link_id, telegramId, token.user_id, liveLink.link_id, token.tournament_id, token.user_id).run();
    if (!staged.meta.changes) throw new CommandError('Mã này đã dùng cho group khác hoặc quyền đã thay đổi. Hãy tạo mã mới.');
    await send('Đã nhận group. Chủ giải hãy mở web và xác nhận kết nối. BXH của giải sẽ được chia sẻ trong group này.');
    return;
  }
  const integration = await env.DB.prepare('SELECT * FROM bilac_telegram WHERE chat_id=? AND enabled=1 AND (?=1 OR binding_id=?)').bind(chatId, update.bindingId === undefined ? 1 : 0, update.bindingId ?? null).first<Integration>();
  if (!integration) { if (verb === '/help') await send('Group chưa kết nối. Chủ giải mở phần Telegram trên web để bắt đầu.'); return; }
  if (verb === '/help') {
    await send(`/bxh@${env.TELEGRAM_BOT_USERNAME}: BXH tuần\n/random@${env.TELEGRAM_BOT_USERNAME}: chọn người và chia đội\n/addplayer@${env.TELEGRAM_BOT_USERNAME} Tên: thêm người\n/score@${env.TELEGRAM_BOT_USERNAME}: xem trận và nút thắng/huỷ\n/score@${env.TELEGRAM_BOT_USERNAME} mã-trận 10 7: nhập điểm (hoặc reply tin trận)\nLịch BXH: 13:20 và 21:00 giờ Việt Nam.`, {}, integration);
    return;
  }
  if (verb === '/bxh') { await send(await tableMessage(env, integration.tournament_id), {}, integration); return; }
  if (!['/random', '/score', '/addplayer'].includes(verb)) return;
  const identity = await authorised(env, integration.tournament_id, telegramId);
  if (update.linkId !== undefined && identity.linkId !== update.linkId) throw new CommandError('Liên kết tài khoản đã thay đổi. Hãy chạy lệnh mới.');
  const id = update.update_id.toString(36);
  if ((verb === '/score' && args.length === 0) || verb === '/random') {
    const active = (await env.DB.prepare("SELECT * FROM bilac_matches WHERE tournament_id=? AND status='PLAYING' ORDER BY timestamp DESC LIMIT 5").bind(integration.tournament_id).all<StoredMatch>()).results;
    if (active.length || verb === '/score') {
      if (!active.length) await send('Chưa có trận đang chơi. Dùng /random để chọn người và chia đội.', {}, integration);
      for (let i = 0; i < active.length; i++) {
        const cardId = `l${id}-${i}`;
        await newDraft(env, cardId, integration, telegramId, 'match', { matchId: active[i].id }, identity, 24 * 3600000);
        await enqueue(env, `list:${cardId}`, chatId, { text: await matchText(env, active[i]), reply_markup: matchButtons(cardId) }, integration.tournament_id, Date.now(), integration.binding_id);
      }
      return;
    }
  }
  if (verb === '/random') {
    const players = (await env.DB.prepare('SELECT id,name FROM bilac_players WHERE tournament_id=? ORDER BY name').bind(integration.tournament_id).all<RankingPlayer>()).results;
    if (players.length < 2) throw new CommandError('Cần ít nhất 2 người. Dùng /addplayer để thêm nhé!');
    const selection: Selection = { players, selected: [], page: 0 };
    await newDraft(env, id, integration, telegramId, 'random', selection, identity);
    const payload = selectionMessage(id, 0, selection);
    await send(payload.text, { reply_markup: payload.reply_markup }, integration);
  } else if (verb === '/addplayer') {
    const name = args.join(' ').normalize('NFC').replace(/\s+/g, ' ').trim();
    if (!name || name.length > 60 || /[\p{Cc}\p{Cf}]/u.test(name)) throw new CommandError('Tên cần từ 1 đến 60 ký tự, không chứa ký tự điều khiển.');
    await newDraft(env, id, integration, telegramId, 'player', { name }, identity);
    await send(`Thêm người chơi: ${name}?`, { reply_markup: { inline_keyboard: [[{ text: 'Xác nhận thêm', callback_data: `add:${id}:0` }]] } }, integration);
  } else {
    let matchId: string | undefined;
    if (args.length === 2) matchId = m.reply_to_message?.text?.match(/Trận #([a-zA-Z0-9-]+)/)?.[1];
    else if (args.length === 3) matchId = args.shift()?.replace(/^#/, '');
    if (!matchId || args.length !== 2) throw new CommandError('Dùng /score mã-trận 10 7, hoặc reply tin trận với /score 10 7.');
    const scores = scoreInput(args[0], args[1]);
    const match = await env.DB.prepare('SELECT * FROM bilac_matches WHERE id=? AND tournament_id=?').bind(matchId, integration.tournament_id).first<StoredMatch>();
    if (!match) throw new CommandError('Không tìm thấy trận trong giải này.');
    await newDraft(env, id, integration, telegramId, 'score', { match, scores }, identity);
    await send(`Trận #${match.id}\nA ${scores[0]} – ${scores[1]} B\n${match.status === 'FINISHED' ? 'Sửa kết quả đã kết thúc (chỉ chủ giải).' : 'Chọn lưu điểm hoặc kết thúc trận.'}`, {
      reply_markup: { inline_keyboard: [[{ text: 'Lưu điểm', callback_data: `save:${id}:0` }, { text: 'Kết thúc trận', callback_data: `finish:${id}:0` }]] },
    }, integration);
  }
}

export async function processUpdate(env: Bindings, update: TelegramUpdate) {
  if (!telegramEnabled(env)) return;
  const chat = update.message?.chat ?? update.callback_query?.message?.chat ?? update.my_chat_member?.chat;
  const bootstrap = /^\/(start|connect)(@\w+)?(\s|$)/i.test(update.message?.text ?? '');
  if (chat && chat.type !== 'private' && !bootstrap && update.bindingId !== undefined) {
    const active = await env.DB.prepare('SELECT binding_id FROM bilac_telegram WHERE chat_id=? AND enabled=1').bind(String(chat.id)).first<{ binding_id: string }>();
    if (!update.bindingId || active?.binding_id !== update.bindingId) return;
  }
  const write = Boolean(update.callback_query) || /^\/(random|score|addplayer|connect)(@\w+)?(\s|$)/i.test(update.message?.text ?? '');
  if (write && update.linkId !== undefined) {
    const telegramId = update.callback_query?.from.id ?? update.message?.from?.id;
    const active = await env.DB.prepare('SELECT link_id FROM telegram_links WHERE telegram_id=?').bind(String(telegramId)).first<{ link_id: string }>();
    if (!update.linkId || active?.link_id !== update.linkId) return;
  }
  try {
    if (update.callback_query) {
      // Stop the spinner even if later database processing needs recovery.
      await telegram(env, 'answerCallbackQuery', { callback_query_id: update.callback_query.id }).catch(() => undefined);
      await callback(env, update);
    } else if (update.message) await message(env, update);
    else if (update.my_chat_member) {
      const status = update.my_chat_member.new_chat_member.status;
      if (['left', 'kicked'].includes(status)) await env.DB.prepare("UPDATE bilac_telegram SET enabled=0,health='Bot removed from group' WHERE chat_id=? AND (?=1 OR binding_id=?)").bind(String(update.my_chat_member.chat.id), update.bindingId === undefined ? 1 : 0, update.bindingId ?? null).run();
    }
  } catch (error) {
    if (!(error instanceof CommandError) && !(error instanceof Error && /^(Bạn|Chọn|Giải|Trận|Điểm)/.test(error.message))) throw error;
    const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
    if (chatId) await enqueue(env, `error:${update.update_id}`, String(chatId), { text: error.message });
  }
}

export async function recoverUpdates(env: Bindings) {
  if (!telegramEnabled(env)) return;
  const now = Date.now();
  const pending = await env.DB.prepare("SELECT id,payload FROM telegram_updates WHERE status='pending' AND lease_until<? AND attempts<5 ORDER BY id LIMIT 20")
    .bind(now).all<{ id: number; payload: string }>();
  for (const row of pending.results) {
    const claim = await env.DB.prepare("UPDATE telegram_updates SET lease_until=?,attempts=attempts+1 WHERE id=? AND status='pending' AND lease_until<?")
      .bind(now + 60000, row.id, now).run();
    if (!claim.meta.changes) continue;
    try {
      await processUpdate(env, JSON.parse(row.payload));
      await env.DB.prepare("UPDATE telegram_updates SET status='done',payload='{}' WHERE id=?").bind(row.id).run();
    } catch {
      // Keep accepted updates durable; the recovery cron retries after lease expiry.
      console.error('Telegram update processing failed', row.id);
    }
  }
}
