import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { Hono } from 'hono';
import { testDatabase } from './telegram-db';
import { telegramRoute } from '../src/routes/telegram';
import { processUpdate } from '../src/lib/telegram-commands';

function signed(id: number) {
  const data = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id }), start_param: 'pick_f2s' });
  const check = [...data.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join('\n');
  data.set('hash', createHmac('sha256', createHmac('sha256', 'WebAppData').update('fixture').digest()).update(check).digest('hex'));
  return data.toString();
}
async function fixture() {
  const { env, sqlite } = testDatabase();
  Object.assign(env, { TELEGRAM_ENABLED: 'true', TELEGRAM_BOT_TOKEN: 'fixture', TELEGRAM_WEBHOOK_SECRET: 'fixture-secret', TELEGRAM_BOT_USERNAME: 'fixture_bot' });
  sqlite.exec("INSERT INTO telegram_links (telegram_id,user_id) VALUES ('123','owner'); INSERT INTO bilac_telegram (tournament_id,chat_id,chat_title,connected_by) VALUES ('cup','-456','Group','owner')");
  const members = new Map<number, { status: string; is_member?: boolean }>([[123,{ status: 'administrator' }],[777,{ status: 'member' }],[888,{ status: 'member' }]]);
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    const result = url.endsWith('/getChatMember') ? { user: { id: body.user_id }, ...(members.get(body.user_id) ?? { status: 'left' }) } : { message_id: 1 };
    return new Response(JSON.stringify({ ok: true, result }));
  });
  vi.stubGlobal('fetch', fetch);
  const binding = sqlite.prepare('SELECT binding_id FROM bilac_telegram').get() as { binding_id: string };
  const command = (id = 777, updateId = 100) => processUpdate(env, { update_id: updateId, bindingId: binding.binding_id, linkId: null, message: { message_id: 1, from: { id }, chat: { id: -456, type: 'supergroup' }, text: '/random@fixture_bot' } });
  const app = new Hono(); app.route('/api/telegram', telegramRoute);
  const waits: Promise<unknown>[] = [];
  const request = (id: number, method = 'GET', draft = 'f2s', resultMultiplier = 1) => app.request('/api/telegram/form/' + draft, { method, headers: { Authorization: 'tma ' + signed(id), 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify({ playerIds: ['a','b'], resultMultiplier }) } : {}) }, env, { props: {}, waitUntil(p: Promise<unknown>) { waits.push(p); }, passThroughOnException() {} });
  return { env, sqlite, members, fetch, command, request, waits, app };
}
afterEach(() => vi.unstubAllGlobals());
describe('Group member randomisation without web accounts', () => {
  it.each([1, 10])('accepts an unlinked group member with multiplier %s through the stamped webhook path', async resultMultiplier => {
    const f = await fixture(); await f.command();
    expect((await f.request(777)).status).toBe(200);
    expect((await f.request(777, 'POST', 'f2s', resultMultiplier)).status).toBe(200);
    expect(f.sqlite.prepare('SELECT count(*) n FROM telegram_links').get()).toEqual({ n: 1 });
    expect(f.sqlite.prepare('SELECT count(*) n FROM users').get()).toEqual({ n: 2 });
    expect(f.sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 1 });
    const audit = f.sqlite.prepare("SELECT after_json FROM bilac_telegram_audit WHERE operation_id LIKE 'create:%'").get() as { after_json: string };
    expect(JSON.parse(audit.after_json)).toMatchObject({ telegramId: '777', chatId: '-456', source: 'telegram-group', resultMultiplier });
    expect(f.sqlite.prepare("SELECT chat_id FROM telegram_outbox WHERE id LIKE 'draft:%'").get()).toEqual({ chat_id: '-456' });
    await Promise.allSettled(f.waits);
  });
  it('processes a real webhook for an unlinked member without trusting supplied authority fields', async () => {
    const f = await fixture();
    const response = await f.app.request('/api/telegram/webhook', { method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': 'fixture-secret', 'Content-Type': 'application/json' }, body: JSON.stringify({ update_id: 105, bindingId: 'forged', linkId: 'forged', message: { message_id: 4, from: { id: 777 }, chat: { id: -456, type: 'supergroup' }, text: '/random@fixture_bot' } }) }, f.env, { props: {}, waitUntil(p: Promise<unknown>) { f.waits.push(p); }, passThroughOnException() {} });
    expect(response.status).toBe(200);
    await Promise.all(f.waits);
    const inbox = f.sqlite.prepare('SELECT payload FROM telegram_updates WHERE id=105').get() as { payload: string };
    expect(JSON.parse(inbox.payload)).toEqual({});
    expect(f.sqlite.prepare("SELECT kind,user_id,telegram_id FROM telegram_drafts WHERE id='f2x'").get()).toEqual({ kind: 'random-group', user_id: 'owner', telegram_id: '777' });
    expect((await f.request(777, 'POST', 'f2x')).status).toBe(200);
    await Promise.allSettled(f.waits);
  });
  it('gives each verified opener a separate form and presence cache', async () => {
    const f = await fixture(); await f.command();
    const a = await (await f.request(777)).json() as { selectionCacheKey: string; submittedMatchId: string | null };
    const b = await (await f.request(888)).json() as typeof a;
    expect(a.selectionCacheKey).not.toBe(b.selectionCacheKey);
    expect((await f.request(777, 'POST')).status).toBe(200);
    expect((await f.request(888)).status).toBe(200);
    expect((await (await f.request(888)).json() as typeof a).submittedMatchId).toBeNull();
    await Promise.allSettled(f.waits);
  });
  it.each(['left','kicked','restricted'])('rejects %s users and outsiders holding a forwarded link', async status => {
    const f = await fixture(); await f.command();
    f.members.set(777, { status, is_member: false });
    expect((await f.request(777)).status).toBe(403);
    expect((await f.request(777, 'POST')).status).toBe(403);
    expect((await f.request(999)).status).toBe(403);
    expect(f.sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 0 });
  });
  it('rechecks membership on submit and fails closed when Telegram is unavailable', async () => {
    const f = await fixture(); await f.command();
    expect((await f.request(777)).status).toBe(200);
    f.members.set(777, { status: 'left' });
    expect((await f.request(777, 'POST')).status).toBe(403);
    f.fetch.mockRejectedValueOnce(new Error('offline'));
    expect((await f.request(888, 'POST')).status).toBe(503);
    expect(f.sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 0 });
  });
  it('allows restricted users who are still members, and checks only the bound group', async () => {
    const f = await fixture(); await f.command();
    f.members.set(888, { status: 'restricted', is_member: true });
    expect((await f.request(888)).status).toBe(200);
    const membershipCalls = f.fetch.mock.calls.filter(([url]) => url.endsWith('/getChatMember'));
    expect(membershipCalls.every(([, init]) => JSON.parse(String(init.body)).chat_id === '-456')).toBe(true);
  });
  it('rejects direct access to another opener personal form and expired lobbies', async () => {
    const f = await fixture(); await f.command(); await f.request(777);
    const child = f.sqlite.prepare("SELECT id FROM telegram_drafts WHERE kind='random-group-form' AND telegram_id='777'").get() as { id: string };
    expect((await f.request(888, 'POST', child.id)).status).toBe(410);
    f.sqlite.exec("UPDATE telegram_drafts SET expires_at=0 WHERE kind='random-group'");
    expect((await f.request(777, 'POST')).status).toBe(410);
  });
  it('rejects a binding change during the external membership check', async () => {
    const f = await fixture(); await f.command(); await f.request(777);
    const original = f.fetch.getMockImplementation()!;
    f.fetch.mockImplementationOnce(async (url, init) => {
      f.sqlite.exec("UPDATE bilac_telegram SET binding_id='changed-during-check'");
      return original(url, init);
    });
    expect((await f.request(777, 'POST')).status).toBe(403);
    expect(f.sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 0 });
  });
  it.each(['binding','owner','link'])('invalidates group forms when %s changes', async change => {
    const f = await fixture(); await f.command(); await f.request(777);
    if (change === 'binding') f.sqlite.exec("UPDATE bilac_telegram SET binding_id='new-binding'");
    else if (change === 'link') f.sqlite.exec("DELETE FROM telegram_links WHERE user_id='owner'; INSERT INTO telegram_links (telegram_id,user_id) VALUES ('123','owner')");
    else f.sqlite.exec("UPDATE bilac_tournament_members SET role='member' WHERE user_id='owner'");
    expect((await f.request(777, 'POST')).status).toBe(403);
    expect(f.sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 0 });
  });
});
