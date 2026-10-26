import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { Hono } from 'hono';
import { testDatabase } from './telegram-db';
import { telegramRoute } from '../src/routes/telegram';
import { processUpdate } from '../src/lib/telegram-commands';
import { verifyMiniAppData } from '../src/lib/telegram-mini-app';

const botToken = 'fixture-token';
function signed(userId = 123, age = 0, token = botToken, startParam?: string) {
  const data = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000) - age), user: JSON.stringify({ id: userId, first_name: 'Test' }), query_id: 'fixture-query' });
  if (startParam) data.set('start_param', startParam);
  const checked = [...data.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const key = createHmac('sha256', 'WebAppData').update(token).digest();
  data.set('hash', createHmac('sha256', key).update(checked).digest('hex'));
  return data.toString();
}
async function fixture() {
  const { env, sqlite } = testDatabase();
  Object.assign(env, { TELEGRAM_ENABLED: 'true', TELEGRAM_BOT_TOKEN: botToken, TELEGRAM_WEBHOOK_SECRET: 'fixture-secret', TELEGRAM_BOT_USERNAME: 'fixture_bot' });
  sqlite.exec("INSERT INTO telegram_links (telegram_id,user_id) VALUES ('123','owner'),('999','other'); INSERT INTO bilac_telegram (tournament_id,chat_id,chat_title,connected_by) VALUES ('cup','-456','Group A','owner')");
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }))));
  await processUpdate(env, { update_id: 100, message: { message_id: 1, from: { id: 123 }, chat: { id: -456, type: 'supergroup' }, text: '/random' } });
  const app = new Hono(); app.route('/api/telegram', telegramRoute);
  const headers = { Authorization: `tma ${signed()}`, 'Content-Type': 'application/json' };
  const waits: Promise<unknown>[] = [];
  const context = { props: {}, waitUntil(p: Promise<unknown>) { waits.push(p); }, passThroughOnException() {} };
  const get = (h = headers) => app.request('/api/telegram/form/f2s', { headers: h }, env, context);
  const post = (body: unknown, h = headers) => app.request('/api/telegram/form/f2s', { method: 'POST', headers: h, body: JSON.stringify(body) }, env, context);
  const submit = (ids: string[], h = headers) => post({ playerIds: ids }, h);
  return { env, sqlite, app, headers, waits, get, submit, post };
}
afterEach(() => { vi.unstubAllGlobals(); });
describe('Telegram local-selection Mini App', () => {
  it('verifies Telegram HMAC, age, and unique data keys', async () => {
    expect(await verifyMiniAppData(signed(), botToken)).toBe('123');
    const directLaunch = signed(123, 0, botToken, 'pick_f2s');
    expect(await verifyMiniAppData(directLaunch, botToken)).toBe('123');
    expect(await verifyMiniAppData(directLaunch.replace('pick_f2s', 'pick_other'), botToken)).toBeNull();
    expect(await verifyMiniAppData(signed().replace('Test', 'Other'), botToken)).toBeNull();
    expect(await verifyMiniAppData(signed(123, 3600), botToken)).toBeNull();
    expect(await verifyMiniAppData(signed(123, -60), botToken)).toBeNull();
    expect(await verifyMiniAppData(signed(123, 0, 'another-bot'), botToken)).toBeNull();
    expect(await verifyMiniAppData(signed() + '&auth_date=123', botToken)).toBeNull();
  });
  it('opens a form link and exposes the roster without creating or changing a match', async () => {
    const f = await fixture();
    const response = await f.get();
    expect(response.status).toBe(200);
    const body = await response.json() as { players: unknown[]; groupName: string; manualTeamsEnabled: boolean };
    expect(body.players).toHaveLength(3); expect(body.groupName).toBe('Group A'); expect(body.manualTeamsEnabled).toBe(true);
    expect(f.sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 0 });
    expect(f.sqlite.prepare("SELECT decision FROM telegram_drafts WHERE id='f2s'").get()).toEqual({ decision: null });
    const payload = JSON.parse((f.sqlite.prepare("SELECT payload FROM telegram_outbox WHERE id='update:100'").get() as { payload: string }).payload);
    expect(payload.reply_markup.inline_keyboard[0][0].url).toBe('https://t.me/fixture_bot?startapp=pick_f2s');
  });
  it('creates once on submit and returns the result to the original group with quick controls', async () => {
    const f = await fixture();
    expect((await f.submit(['a','b'])).status).toBe(200);
    expect((await f.submit(['b','a'])).status).toBe(200);
    expect((await f.submit(['a','c'])).status).toBe(409);
    expect(f.sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 1 });
    const queued = f.sqlite.prepare("SELECT chat_id,payload FROM telegram_outbox WHERE id='draft:f2s'").get() as { chat_id: string; payload: string };
    expect(queued.chat_id).toBe('-456');
    expect(JSON.parse(queued.payload).reply_markup.inline_keyboard.flat().map((b: { text: string }) => b.text)).toContain('🔵 A thắng');
    await Promise.allSettled(f.waits);
  });
  it('rejects unsigned requests, foreign accounts, foreign roster IDs, and cross-origin requests', async () => {
    const f = await fixture();
    expect((await f.get({ ...f.headers, Authorization: '' })).status).toBe(401);
    expect((await f.get({ ...f.headers, Authorization: `tma ${signed(999)}` })).status).toBe(403);
    expect((await f.submit(['a','unknown'])).status).toBe(400);
    expect((await f.submit(['a','a'])).status).toBe(400);
    expect((await f.get({ ...f.headers, Origin: 'https://evil.test' } as typeof f.headers)).status).toBe(403);
    expect(f.sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 0 });
  });
  it.each(['binding', 'link', 'membership', 'expiry'])('invalidates the form when %s changes', async kind => {
    const f = await fixture();
    if (kind === 'binding') f.sqlite.exec("UPDATE bilac_telegram SET binding_id='changed' WHERE tournament_id='cup'");
    if (kind === 'link') f.sqlite.exec("DELETE FROM telegram_links WHERE telegram_id='123'; INSERT INTO telegram_links (telegram_id,user_id) VALUES ('123','owner')");
    if (kind === 'membership') f.sqlite.exec("DELETE FROM bilac_tournament_members WHERE user_id='owner'");
    if (kind === 'expiry') f.sqlite.exec('UPDATE telegram_drafts SET expires_at=0');
    expect([403,410]).toContain((await f.submit(['a','b'])).status);
    expect(f.sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 0 });
  });
  it.each([false, true])('serialises concurrent submissions (different selections: %s)', async different => {
    const f = await fixture();
    const results = await Promise.all([f.submit(['a','b']), f.submit(different ? ['a','c'] : ['b','a'])]);
    expect(results.map(r => r.status).sort()).toEqual(different ? [200,409] : [200,200]);
    expect(f.sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 1 });
    expect(f.sqlite.prepare("SELECT count(*) n FROM telegram_outbox WHERE id='draft:f2s'").get()).toEqual({ n: 1 });
    await Promise.allSettled(f.waits);
  });
  it('keeps the presence cache scope stable across drafts and changes it after relinking', async () => {
    const f = await fixture();
    const initial = await (await f.get()).json() as { selectionCacheKey: string };
    expect(initial.selectionCacheKey).toMatch(/^[a-f0-9]{64}$/);
    await processUpdate(f.env, { update_id: 101, message: { message_id: 2, from: { id: 123 }, chat: { id: -456, type: 'supergroup' }, text: '/random' } });
    const later = await f.app.request('/api/telegram/form/f2t', { headers: f.headers }, f.env) ;
    expect((await later.json() as { selectionCacheKey: string }).selectionCacheKey).toBe(initial.selectionCacheKey);
    f.sqlite.exec("DELETE FROM telegram_links WHERE telegram_id='123'; INSERT INTO telegram_links (telegram_id,user_id) VALUES ('123','owner')");
    await processUpdate(f.env, { update_id: 102, message: { message_id: 3, from: { id: 123 }, chat: { id: -456, type: 'supergroup' }, text: '/random' } });
    const changed = await f.app.request('/api/telegram/form/f2u', { headers: f.headers }, f.env);
    expect((await changed.json() as { selectionCacheKey: string }).selectionCacheKey).not.toBe(initial.selectionCacheKey);
  });
  it('preserves two manually selected pairs and rejects a different assignment on retry', async () => {
    const f = await fixture();
    f.sqlite.exec("INSERT INTO bilac_players (id,tournament_id,name,avatar) VALUES ('d','cup','Dũng',''); UPDATE telegram_drafts SET payload=json_set(payload,'$.players[#]',json_object('id','d','name','Dũng')) WHERE id='f2s'");
    const body = { mode: 'manual', playerIds: ['a','b','c','d'], teamA: ['a','c'], teamB: ['b','d'] };
    expect((await f.post(body)).status).toBe(200);
    expect(f.sqlite.prepare("SELECT team1,team2,benched FROM bilac_matches WHERE id='tg-f2s'").get()).toEqual({ team1: '["a","c"]', team2: '["b","d"]', benched: null });
    expect((await f.post({ ...body, teamA: ['c','a'], teamB: ['d','b'] })).status).toBe(200);
    expect((await f.post({ ...body, teamA: ['a','b'], teamB: ['c','d'] })).status).toBe(409);
    expect((await f.submit(body.playerIds)).status).toBe(409);
    await Promise.allSettled(f.waits);
  });
  it.each([
    { mode: 'unknown', playerIds: ['a','b'] },
    { mode: 'manual', playerIds: ['a','b'], teamA: ['a'], teamB: ['b'] },
    { mode: 'manual', playerIds: ['a','b','c'], teamA: ['a','b'], teamB: ['b','c'] },
    { mode: 'manual', playerIds: ['a','b','c','unknown'], teamA: ['a','b'], teamB: ['c','unknown'] },
    { mode: 'manual', playerIds: ['a','b'], teamA: null, teamB: [] },
  ])('rejects invalid manual selections: %j', async body => {
    const f = await fixture();
    expect((await f.post(body)).status).toBe(400);
    expect(f.sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 0 });
  });
  it('opens a native web_app button only for the original private-chat actor', async () => {
    const f = await fixture();
    await processUpdate(f.env, { update_id: 101, message: { message_id: 1, from: { id: 123 }, chat: { id: 123, type: 'private' }, text: '/start pick_f2s' } });
    const payload = JSON.parse((f.sqlite.prepare("SELECT payload FROM telegram_outbox WHERE id='update:101'").get() as { payload: string }).payload);
    expect(payload.reply_markup.inline_keyboard[0][0].web_app.url).toContain('/telegram/random?draft=f2s');
    await processUpdate(f.env, { update_id: 102, message: { message_id: 2, from: { id: 999 }, chat: { id: 999, type: 'private' }, text: '/start pick_f2s' } });
    expect(f.sqlite.prepare("SELECT count(*) n FROM telegram_outbox WHERE id='update:102'").get()).toEqual({ n: 0 });
  });

});
