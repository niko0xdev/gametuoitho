import { isResultMultiplier, resultMultipliers, storedResultMultiplier } from '../../../shared/bilac-multipliers';
import { Hono } from 'hono';
import type { Bindings } from '../db';
import { verifyMiniAppData } from '../lib/telegram-mini-app';
import { sameOrigin } from '../lib/session';
import { telegramActorSql, telegramActorParams, type TelegramActorBinding } from '../lib/telegram-config';
import { createBiLacMatch, memberRole } from '../lib/bilac-actions';
import { publishMatchCard } from '../lib/telegram-commands';
import { deliver } from '../lib/telegram-client';
import { sha256Hex } from '../lib/password';
import { groupRandomIdentity, TelegramGroupAccessError } from '../lib/telegram-group';

interface FormDraft {
  id: string; tournament_id: string; chat_id: string; binding_id: string; telegram_id: string;
  user_id: string; link_id: string; payload: string; expires_at: number; kind: string; consumed: number; decision: string | null;
}
interface FormState { draft: FormDraft; actor: TelegramActorBinding; groupName: string; tournamentName: string }
interface FormPayload { players: Array<{ id: string; name: string }>; submittedIds?: string[]; mode?: 'random' | 'manual' | 'timeout'; resultMultiplier?: number; teamA?: string[]; teamB?: string[] }
export const telegramFormRoute = new Hono<{ Bindings: Bindings; Variables: { form: FormState } }>();
telegramFormRoute.use('/:id', async (c, next) => {
  const started = Date.now();
  c.header('Cache-Control', 'private, no-store');
  if (!sameOrigin(c)) return c.json({ error: 'Nguồn yêu cầu không hợp lệ.' }, 403);
  const auth = c.req.header('Authorization') ?? '';
  const telegramId = auth.startsWith('tma ') ? await verifyMiniAppData(auth.slice(4), c.env.TELEGRAM_BOT_TOKEN ?? '') : null;
  if (!telegramId) return c.json({ error: 'Hãy mở form từ nút trong chat với bot Telegram.' }, 401);
  const id = c.req.param('id');
  if (!/^[a-z0-9-]{1,64}$/.test(id)) return c.json({ error: 'Form không hợp lệ.' }, 400);
  let draft = await c.env.DB.prepare("SELECT * FROM telegram_drafts WHERE id=? AND kind IN ('random-form','random-group')").bind(id).first<FormDraft>();
  if (!draft || draft.expires_at < Date.now()) return c.json({ error: 'Form đã hết hạn. Dùng /random để mở form mới.' }, 410);
  const groupMember = draft.kind === 'random-group';
  if (groupMember) {
    let identity;
    try { identity = await groupRandomIdentity(c.env, draft, telegramId); }
    catch (error) { if (error instanceof TelegramGroupAccessError) return c.json({ error: error.message }, error.status); throw error; }
    if (identity.userId !== draft.user_id || identity.linkId !== draft.link_id) return c.json({ error: 'Liên kết chủ giải đã thay đổi. Hãy mở /random mới.' }, 403);
    const actor = { id: draft.binding_id, chatId: draft.chat_id, telegramId, linkId: draft.link_id, groupMember: true };
    const personalId = 'g' + (await sha256Hex(JSON.stringify([draft.id, telegramId]))).slice(0, 40);
    await c.env.DB.prepare(`INSERT OR IGNORE INTO telegram_drafts (id,tournament_id,chat_id,telegram_id,kind,payload,expires_at,binding_id,user_id,link_id)
      SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${telegramActorSql}`)
      .bind(personalId, draft.tournament_id, draft.chat_id, telegramId, 'random-group-form', draft.payload, draft.expires_at, draft.binding_id, draft.user_id, draft.link_id,
        ...telegramActorParams(draft.tournament_id, draft.user_id, actor)).run();
    const personal = await c.env.DB.prepare("SELECT * FROM telegram_drafts WHERE id=? AND kind='random-group-form'").bind(personalId).first<FormDraft>();
    if (!personal) return c.json({ error: 'Quyền group đã thay đổi. Hãy mở form mới.' }, 403);
    draft = personal;
  } else {
    const link = await c.env.DB.prepare('SELECT user_id,link_id FROM telegram_links WHERE telegram_id=?').bind(telegramId).first<{ user_id: string; link_id: string }>();
    if (draft.telegram_id !== telegramId || link?.user_id !== draft.user_id || link.link_id !== draft.link_id || !await memberRole(c.env, draft.tournament_id, draft.user_id)) return c.json({ error: 'Form này không thuộc tài khoản của bạn, hoặc quyền đã thay đổi.' }, 403);
  }
  const integration = await c.env.DB.prepare(`SELECT i.chat_title,t.name FROM bilac_telegram i JOIN bilac_tournaments t ON t.id=i.tournament_id
    WHERE i.tournament_id=? AND i.chat_id=? AND i.binding_id=? AND i.enabled=1`).bind(draft.tournament_id, draft.chat_id, draft.binding_id).first<{ chat_title: string; name: string }>();
  if (!integration) return c.json({ error: 'Group đã thay đổi liên kết. Hãy mở form mới.' }, 403);
  c.set('form', { draft, actor: { id: draft.binding_id, chatId: draft.chat_id, telegramId, linkId: draft.link_id, groupMember }, groupName: integration.chat_title, tournamentName: integration.name });
  await next();
  console.info('Telegram form timing', { method: c.req.method, elapsedMs: Date.now() - started, status: c.res.status });
});
telegramFormRoute.get('/:id', async c => {
  const { draft, groupName, tournamentName } = c.get('form');
  const payload = JSON.parse(draft.payload) as FormPayload;
  const selectionCacheKey = await sha256Hex(JSON.stringify([draft.user_id, draft.telegram_id, draft.link_id, draft.tournament_id, draft.chat_id, draft.binding_id]));
  return c.json({ manualTeamsEnabled: true, timeoutModeEnabled: true, resultMultipliers, resultMultiplier: payload.resultMultiplier ?? 1, selectionCacheKey, players: payload.players, groupName, tournamentName, expiresAt: draft.expires_at, submittedMatchId: draft.consumed ? 'tg-' + draft.id : null });
});
telegramFormRoute.post('/:id', async c => {
  const state = c.get('form'), { draft, actor } = state;
  const raw = await c.req.text();
  if (raw.length > 65536) return c.json({ error: 'Danh sách quá lớn.' }, 413);
  let input: { playerIds?: unknown; mode?: unknown; resultMultiplier?: unknown; teamA?: unknown; teamB?: unknown };
  try { input = JSON.parse(raw); } catch { return c.json({ error: 'Dữ liệu không hợp lệ.' }, 400); }
  const ids = input?.playerIds;
  const payload = JSON.parse(draft.payload) as FormPayload;
  const allowed = new Set(payload.players.map(p => p.id));
  if (!Array.isArray(ids) || ids.length < 2 || ids.some(id => typeof id !== 'string' || !allowed.has(id)) || new Set(ids).size !== ids.length) return c.json({ error: 'Chọn ít nhất 2 người trong danh sách, không chọn trùng.' }, 400);
  const selected = [...ids].sort() as string[];
  const mode = input.mode ?? 'random';
  if (mode !== 'random' && mode !== 'manual' && mode !== 'timeout') return c.json({ error: 'Chế độ tạo trận không hợp lệ.' }, 400);
  if (mode === 'timeout' && selected.length < 4) return c.json({ error: 'Chọn ít nhất 4 người cho chế độ Hết giờ.' }, 400);
  const resultMultiplier = input.resultMultiplier === undefined ? 1 : input.resultMultiplier;
  if (!isResultMultiplier(resultMultiplier)) return c.json({ error: 'Hệ số kết quả không hợp lệ.' }, 400);
  let teams: { teamA: string[]; teamB: string[] } | undefined;
  if (mode === 'manual') {
    const validPair = (pair: unknown): pair is string[] => Array.isArray(pair) && pair.length === 2 && pair.every(id => typeof id === 'string' && allowed.has(id));
    if (!validPair(input.teamA) || !validPair(input.teamB)) return c.json({ error: 'Chọn đúng 2 người mỗi đội.' }, 400);
    const assigned = [...input.teamA, ...input.teamB];
    if (new Set(assigned).size !== 4 || JSON.stringify([...assigned].sort()) !== JSON.stringify(selected)) return c.json({ error: 'Hai đội cần 4 người khác nhau trong danh sách đã chọn.' }, 400);
    teams = { teamA: [...input.teamA].sort(), teamB: [...input.teamB].sort() };
  }
  const sameSelection = (p: FormPayload) => JSON.stringify(p.submittedIds) === JSON.stringify(selected) && (p.mode ?? 'random') === mode && (p.resultMultiplier ?? 1) === resultMultiplier
    && (mode !== 'manual' || (JSON.stringify(p.teamA) === JSON.stringify(teams!.teamA) && JSON.stringify(p.teamB) === JSON.stringify(teams!.teamB)));
  if (draft.consumed && !sameSelection(payload)) return c.json({ error: 'Form đã tạo trận với một danh sách khác. Dùng /random để mở lại.' }, 409);
  if (!draft.consumed) {
    const claim = await c.env.DB.prepare(`UPDATE telegram_drafts SET decision='submit',payload=? WHERE id=? AND consumed=0 AND decision IS NULL AND expires_at>?
      AND EXISTS (SELECT 1 FROM bilac_tournament_members WHERE tournament_id=? AND user_id=?) AND ${telegramActorSql}`)
      .bind(JSON.stringify({ ...payload, submittedIds: selected, mode, resultMultiplier, ...teams }), draft.id, Date.now(), draft.tournament_id, draft.user_id, ...telegramActorParams(draft.tournament_id, draft.user_id, actor)).run();
    if (!claim.meta.changes) {
      const current = await c.env.DB.prepare('SELECT payload,decision FROM telegram_drafts WHERE id=?').bind(draft.id).first<{ payload: string; decision: string | null }>();
      if (!current || current.decision !== 'submit' || !sameSelection(JSON.parse(current.payload))) return c.json({ error: 'Form hoặc quyền đã thay đổi. Hãy mở lại.' }, 409);
    }
  }
  try {
    const match = await createBiLacMatch(c.env, draft.tournament_id, draft.user_id, selected, 'tg-' + draft.id, actor, teams, resultMultiplier, mode === 'timeout' ? 'timeout' : 'normal');
    await publishMatchCard(c.env, match, { ...draft, groupMember: actor.groupMember });
    await c.env.DB.prepare("UPDATE telegram_drafts SET consumed=1 WHERE id=? AND decision='submit'").bind(draft.id).run();
    c.executionCtx.waitUntil(deliver(c.env, Date.now(), [`draft:${draft.id}`]));
    return c.json({ success: true, matchId: match.id, resultMultiplier: storedResultMultiplier(match), groupName: state.groupName });
  } catch (error) {
    const exists = await c.env.DB.prepare('SELECT 1 FROM bilac_matches WHERE id=?').bind('tg-' + draft.id).first();
    if (!exists && !draft.consumed) await c.env.DB.prepare("UPDATE telegram_drafts SET decision=NULL,payload=? WHERE id=? AND decision='submit' AND consumed=0").bind(JSON.stringify(payload), draft.id).run();
    const message = error instanceof Error && /^(Bạn|Chọn|Giải|Trận)/.test(error.message) ? error.message : 'Chưa thể chia đội. Bạn có thể bấm thử lại.';
    return c.json({ error: message }, 409);
  }
});
