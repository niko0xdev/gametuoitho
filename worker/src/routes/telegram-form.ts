import { Hono } from 'hono';
import type { Bindings } from '../db';
import { verifyMiniAppData } from '../lib/telegram-mini-app';
import { sameOrigin } from '../lib/session';
import { telegramActorSql, telegramActorParams, type TelegramActorBinding } from '../lib/telegram-config';
import { createBiLacMatch, memberRole } from '../lib/bilac-actions';
import { publishMatchCard } from '../lib/telegram-commands';
import { deliver } from '../lib/telegram-client';

interface FormDraft {
  id: string; tournament_id: string; chat_id: string; binding_id: string; telegram_id: string;
  user_id: string; link_id: string; payload: string; expires_at: number; consumed: number; decision: string | null;
}
interface FormState { draft: FormDraft; actor: TelegramActorBinding; groupName: string; tournamentName: string }
interface FormPayload { players: Array<{ id: string; name: string }>; submittedIds?: string[] }
export const telegramFormRoute = new Hono<{ Bindings: Bindings; Variables: { form: FormState } }>();
telegramFormRoute.use('/:id', async (c, next) => {
  c.header('Cache-Control', 'private, no-store');
  if (!sameOrigin(c)) return c.json({ error: 'Nguồn yêu cầu không hợp lệ.' }, 403);
  const auth = c.req.header('Authorization') ?? '';
  const telegramId = auth.startsWith('tma ') ? await verifyMiniAppData(auth.slice(4), c.env.TELEGRAM_BOT_TOKEN ?? '') : null;
  if (!telegramId) return c.json({ error: 'Hãy mở form từ nút trong chat với bot Telegram.' }, 401);
  const id = c.req.param('id');
  if (!/^[a-z0-9-]{1,64}$/.test(id)) return c.json({ error: 'Form không hợp lệ.' }, 400);
  const draft = await c.env.DB.prepare("SELECT * FROM telegram_drafts WHERE id=? AND kind='random-form'").bind(id).first<FormDraft>();
  if (!draft || draft.expires_at < Date.now()) return c.json({ error: 'Form đã hết hạn. Dùng /random để mở form mới.' }, 410);
  const link = await c.env.DB.prepare('SELECT user_id,link_id FROM telegram_links WHERE telegram_id=?').bind(telegramId).first<{ user_id: string; link_id: string }>();
  if (draft.telegram_id !== telegramId || link?.user_id !== draft.user_id || link.link_id !== draft.link_id || !await memberRole(c.env, draft.tournament_id, draft.user_id)) return c.json({ error: 'Form này không thuộc tài khoản của bạn, hoặc quyền đã thay đổi.' }, 403);
  const integration = await c.env.DB.prepare(`SELECT i.chat_title,t.name FROM bilac_telegram i JOIN bilac_tournaments t ON t.id=i.tournament_id
    WHERE i.tournament_id=? AND i.chat_id=? AND i.binding_id=? AND i.enabled=1`).bind(draft.tournament_id, draft.chat_id, draft.binding_id).first<{ chat_title: string; name: string }>();
  if (!integration) return c.json({ error: 'Group đã thay đổi liên kết. Hãy mở form mới.' }, 403);
  c.set('form', { draft, actor: { id: draft.binding_id, chatId: draft.chat_id, telegramId, linkId: draft.link_id }, groupName: integration.chat_title, tournamentName: integration.name });
  await next();
});
telegramFormRoute.get('/:id', async c => {
  const { draft, groupName, tournamentName } = c.get('form');
  const payload = JSON.parse(draft.payload) as FormPayload;
  return c.json({ players: payload.players, groupName, tournamentName, expiresAt: draft.expires_at, submittedMatchId: draft.consumed ? 'tg-' + draft.id : null });
});
telegramFormRoute.post('/:id', async c => {
  const state = c.get('form'), { draft, actor } = state;
  const raw = await c.req.text();
  if (raw.length > 65536) return c.json({ error: 'Danh sách quá lớn.' }, 413);
  let input: { playerIds?: unknown };
  try { input = JSON.parse(raw); } catch { return c.json({ error: 'Dữ liệu không hợp lệ.' }, 400); }
  const ids = input?.playerIds;
  const payload = JSON.parse(draft.payload) as FormPayload;
  const allowed = new Set(payload.players.map(p => p.id));
  if (!Array.isArray(ids) || ids.length < 2 || ids.some(id => typeof id !== 'string' || !allowed.has(id)) || new Set(ids).size !== ids.length) return c.json({ error: 'Chọn ít nhất 2 người trong danh sách, không chọn trùng.' }, 400);
  const selected = [...ids].sort() as string[];
  const sameSelection = (p: FormPayload) => JSON.stringify(p.submittedIds) === JSON.stringify(selected);
  if (draft.consumed && !sameSelection(payload)) return c.json({ error: 'Form đã tạo trận với một danh sách khác. Dùng /random để mở lại.' }, 409);
  if (!draft.consumed) {
    const claim = await c.env.DB.prepare(`UPDATE telegram_drafts SET decision='submit',payload=? WHERE id=? AND consumed=0 AND decision IS NULL AND expires_at>?
      AND EXISTS (SELECT 1 FROM bilac_tournament_members WHERE tournament_id=? AND user_id=?) AND ${telegramActorSql}`)
      .bind(JSON.stringify({ ...payload, submittedIds: selected }), draft.id, Date.now(), draft.tournament_id, draft.user_id, ...telegramActorParams(draft.tournament_id, draft.user_id, actor)).run();
    if (!claim.meta.changes) {
      const current = await c.env.DB.prepare('SELECT payload,decision FROM telegram_drafts WHERE id=?').bind(draft.id).first<{ payload: string; decision: string | null }>();
      if (!current || current.decision !== 'submit' || !sameSelection(JSON.parse(current.payload))) return c.json({ error: 'Form hoặc quyền đã thay đổi. Hãy mở lại.' }, 409);
    }
  }
  try {
    const match = await createBiLacMatch(c.env, draft.tournament_id, draft.user_id, selected, 'tg-' + draft.id, actor);
    await publishMatchCard(c.env, match, draft);
    await c.env.DB.prepare("UPDATE telegram_drafts SET consumed=1 WHERE id=? AND decision='submit'").bind(draft.id).run();
    c.executionCtx.waitUntil(deliver(c.env));
    return c.json({ success: true, matchId: match.id, groupName: state.groupName });
  } catch (error) {
    const exists = await c.env.DB.prepare('SELECT 1 FROM bilac_matches WHERE id=?').bind('tg-' + draft.id).first();
    if (!exists && !draft.consumed) await c.env.DB.prepare("UPDATE telegram_drafts SET decision=NULL,payload=? WHERE id=? AND decision='submit' AND consumed=0").bind(JSON.stringify(payload), draft.id).run();
    const message = error instanceof Error && /^(Bạn|Chọn|Giải|Trận)/.test(error.message) ? error.message : 'Chưa thể chia đội. Bạn có thể bấm thử lại.';
    return c.json({ error: message }, 409);
  }
});
