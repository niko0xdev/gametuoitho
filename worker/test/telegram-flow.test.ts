import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { testDatabase } from './telegram-db';
import { telegramRoute } from '../src/routes/telegram';
import { authRoute } from '../src/routes/auth';
import { bilacRoute } from '../src/routes/bilac';
import { processUpdate } from '../src/lib/telegram-commands';
import { runTelegramSchedule } from '../src/lib/telegram-schedule';
import { sha256Hex } from '../src/lib/password';

function fixture() {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: true, result: { message_id: 1, status: 'administrator' } }))));
  const { env, sqlite } = testDatabase();
  Object.assign(env, { TELEGRAM_BOT_TOKEN: 'fixture', TELEGRAM_WEBHOOK_SECRET: 'fixture-secret', TELEGRAM_BOT_USERNAME: 'fixture_bot' });
  const app = new Hono();
  app.route('/api/auth', authRoute); app.route('/api/bilac', bilacRoute); app.route('/api/telegram', telegramRoute);
  return { env, sqlite, app };
}
afterEach(() => vi.unstubAllGlobals());
describe('Telegram integrated flows', () => {
  it('rejects forged owner headers and cross-origin settings requests', async () => {
    const { app, env } = fixture();
    const response = await app.request('/api/telegram/settings/token', { method: 'POST', headers: { 'x-user-id': 'owner', 'x-tournament-id': 'cup', 'Content-Type': 'application/json' }, body: JSON.stringify({ purpose: 'account' }) }, env);
    expect(response.status).toBe(401);
    const evil = await app.request('/api/telegram/settings/token', { method: 'POST', headers: { Origin: 'https://evil.test' } }, env);
    expect(evil.status).toBe(403);
  });
  it('links a verified login, requires web confirmation, and connects a group', async () => {
    const { app, env, sqlite } = fixture();
    sqlite.prepare('UPDATE users SET password_hash=? WHERE id=?').run(await sha256Hex('TestPassword1'), 'owner');
    const login = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'owner', password: 'TestPassword1' }) }, env);
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const headers = { Cookie: cookie, 'x-user-id': 'owner', 'x-tournament-id': 'cup', 'Content-Type': 'application/json' };
    const account = await app.request('/api/telegram/settings/token', { method: 'POST', headers, body: '{"purpose":"account"}' }, env);
    const { url } = await account.json() as { url: string };
    await processUpdate(env, { update_id: 1, message: { message_id: 1, from: { id: 123 }, chat: { id: 123, type: 'private' }, text: '/start ' + new URL(url).searchParams.get('start') } });
    expect(sqlite.prepare('SELECT * FROM telegram_links').all()).toHaveLength(0);
    const pending = sqlite.prepare("SELECT hash FROM telegram_tokens WHERE purpose='account'").get() as { hash: string };
    expect((await app.request('/api/telegram/settings/confirm', { method: 'POST', headers, body: JSON.stringify({ id: pending.hash }) }, env)).status).toBe(200);
    expect(sqlite.prepare('SELECT telegram_id FROM telegram_links').get()).toEqual({ telegram_id: '123' });
    const group = await app.request('/api/telegram/settings/token', { method: 'POST', headers, body: '{"purpose":"group"}' }, env);
    const { command } = await group.json() as { command: string };
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: true, result: { status: 'administrator' } }))));
    await processUpdate(env, { update_id: 2, message: { message_id: 2, from: { id: 123 }, chat: { id: -456, title: 'Test Group', type: 'supergroup' }, text: command } });
    expect(sqlite.prepare('SELECT * FROM bilac_telegram').all()).toHaveLength(0);
    const token = sqlite.prepare("SELECT hash FROM telegram_tokens WHERE purpose='group'").get() as { hash: string };
    expect((await app.request('/api/telegram/settings/confirm', { method: 'POST', headers, body: JSON.stringify({ id: token.hash }) }, env)).status).toBe(200);
    expect(sqlite.prepare('SELECT chat_id FROM bilac_telegram').get()).toEqual({ chat_id: '-456' });
    const logout = await app.request('/api/auth/logout', { method: 'POST', headers }, env);
    expect(logout.status).toBe(200);
    expect((await app.request('/api/telegram/settings/status', { headers }, env)).status).toBe(401);
    const nonMember = await app.request('/api/bilac/matches', { method: 'POST', headers: { ...headers, 'x-user-id': 'other', 'x-tournament-code': 'private' }, body: '{"playerIds":["a","b"]}' }, env);
    expect(nonMember.status).toBe(401);
  });
  it('adds a player once, rejects other actors, and rejects expired confirmations', async () => {
    const { env, sqlite } = fixture();
    sqlite.exec("INSERT INTO telegram_links VALUES ('123','owner'); INSERT INTO bilac_telegram (tournament_id,chat_id,chat_title,connected_by) VALUES ('cup','-456','Group','owner');");
    const message = { message_id: 3, from: { id: 123 }, chat: { id: -456, type: 'supergroup' }, text: '/addplayer@fixture_bot Đạt' };
    await processUpdate(env, { update_id: 3, message });
    const callback = { id: 'c', from: { id: 999 }, data: 'add:3:0', message };
    await processUpdate(env, { update_id: 4, callback_query: callback });
    expect(sqlite.prepare("SELECT count(*) n FROM bilac_players WHERE name='Đạt'").get()).toEqual({ n: 0 });
    callback.from.id = 123;
    await processUpdate(env, { update_id: 5, callback_query: callback });
    await processUpdate(env, { update_id: 6, callback_query: callback });
    expect(sqlite.prepare("SELECT count(*) n FROM bilac_players WHERE name='Đạt'").get()).toEqual({ n: 1 });
    await processUpdate(env, { update_id: 7, message: { ...message, text: '/addplayer Hết hạn' } });
    sqlite.exec("UPDATE telegram_drafts SET expires_at=0 WHERE id='7'");
    await processUpdate(env, { update_id: 8, callback_query: { ...callback, data: 'add:7:0' } });
    expect(sqlite.prepare("SELECT count(*) n FROM bilac_players WHERE name='Hết hạn'").get()).toEqual({ n: 0 });
  });
  it('recovers a keyboard edit failure and allows choosing after an empty confirmation', async () => {
    const { env, sqlite } = fixture();
    sqlite.exec("INSERT INTO telegram_links VALUES ('123','owner'); INSERT INTO bilac_telegram (tournament_id,chat_id,chat_title,connected_by) VALUES ('cup','-456','Group','owner');");
    const message = { message_id: 1, from: { id: 123 }, chat: { id: -456, type: 'supergroup' }, text: '/random' };
    await processUpdate(env, { update_id: 10, message });
    const click = (id: number, data: string) => processUpdate(env, { update_id: id, callback_query: { id: String(id), from: { id: 123 }, message, data } });
    await click(11, 'go:a:0');
    expect(sqlite.prepare("SELECT decision FROM telegram_drafts WHERE id='a'").get()).toEqual({ decision: null });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/editMessageText')) throw new Error('timeout');
      return new Response(JSON.stringify({ ok: true, result: {} }));
    }));
    await expect(click(12, 'sel:a:0:0:1')).rejects.toThrow('timeout');
    expect(sqlite.prepare("SELECT revision FROM telegram_drafts WHERE id='a'").get()).toEqual({ revision: 1 });
    const edits: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith('/editMessageText')) edits.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ ok: true, result: {} }));
    }));
    await click(12, 'sel:a:0:0:1');
    expect(edits).toHaveLength(1);
    await click(13, 'sel:a:1:1:1');
    await click(14, 'go:a:2');
    const match = sqlite.prepare('SELECT id,status FROM bilac_matches').get() as { id: string; status: string };
    expect(match.status).toBe('PLAYING');
    await processUpdate(env, { update_id: 15, message: { ...message, text: `/score ${match.id} 10 7` } });
    await click(16, 'finish:f:0');
    await click(17, 'save:f:0');
    expect(sqlite.prepare('SELECT score1,score2,status,revision FROM bilac_matches').get()).toEqual({ score1: 10, score2: 7, status: 'FINISHED', revision: 1 });
  });
  it('deduplicates both scheduled slots without publishing on the prune cron', async () => {
    const { env, sqlite } = fixture();
    sqlite.exec("INSERT INTO bilac_telegram (tournament_id,chat_id,chat_title,connected_by) VALUES ('cup','-456','Group','owner');");
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }))));
    const time = Date.now();
    await runTelegramSchedule(env, '20 6 * * *', time);
    await runTelegramSchedule(env, '20 6 * * *', time);
    await runTelegramSchedule(env, '0 14 * * *', time);
    await runTelegramSchedule(env, '13 */6 * * *', time);
    expect(sqlite.prepare("SELECT count(*) n FROM telegram_outbox WHERE id LIKE 'standings:%'").get()).toEqual({ n: 2 });
  });
  it('verifies webhook secrets before accepting updates and suppresses replays', async () => {
    const { app, env, sqlite } = fixture();
    const waits: Promise<unknown>[] = [];
    const context = { props: {}, waitUntil(p: Promise<unknown>) { waits.push(p); }, passThroughOnException() {} };
    const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"update_id":101}' };
    expect((await app.request('/api/telegram/webhook', options, env, context)).status).toBe(401);
    options.headers['X-Telegram-Bot-Api-Secret-Token'] = 'fixture-secret';
    expect((await app.request('/api/telegram/webhook', options, env, context)).status).toBe(200);
    await Promise.all(waits);
    expect((await app.request('/api/telegram/webhook', options, env, context)).status).toBe(200);
    await Promise.all(waits);
    expect(sqlite.prepare('SELECT count(*) n FROM telegram_updates').get()).toEqual({ n: 1 });
  });
});
