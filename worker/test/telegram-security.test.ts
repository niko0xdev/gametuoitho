import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { testDatabase } from './telegram-db';
import { telegramRoute } from '../src/routes/telegram';
import { issueSession } from '../src/lib/session';
import { processUpdate } from '../src/lib/telegram-commands';
import { deliver, enqueue } from '../src/lib/telegram-client';
import { createBiLacMatch, saveBiLacScore } from '../src/lib/bilac-actions';
import { runTelegramSchedule } from '../src/lib/telegram-schedule';
import type { Bindings } from '../src/db';

function fixture() {
  const { env, sqlite } = testDatabase();
  Object.assign(env, { TELEGRAM_ENABLED: 'true', TELEGRAM_BOT_TOKEN: 'fixture', TELEGRAM_WEBHOOK_SECRET: 'fixture-secret', TELEGRAM_BOT_USERNAME: 'fixture_bot' });
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: true, result: { message_id: 1, status: 'administrator' } }))));
  sqlite.exec(`INSERT INTO bilac_tournaments (id,name,code,created_at,slug) VALUES ('cup2','Second Cup','other-code',0,'abcdefgh');
    INSERT INTO bilac_tournament_members (id,tournament_id,user_id,username,display_name,role,joined_at) VALUES
    ('m2','cup2','other','other','Other','owner',0),('m3','cup','other','other','Other','member',0);
    INSERT INTO telegram_links (telegram_id,user_id) VALUES ('123','owner'),('999','other');
    INSERT INTO bilac_telegram (tournament_id,chat_id,chat_title,connected_by) VALUES ('cup','-456','Group A','owner'),('cup2','-789','Group B','other');`);
  const app = new Hono<{ Bindings: Bindings }>();
  // This test-only route supplies verified sessions without production credentials.
  app.post('/fixture-session/:user', async c => { await issueSession(c, c.req.param('user')); return c.json({ ok: true }); });
  app.route('/api/telegram', telegramRoute);
  return { env, sqlite, app };
}
afterEach(() => vi.unstubAllGlobals());
describe('Telegram feature gate and tournament isolation', () => {
  it('defaults off and suppresses configuration, webhook intake, processing, schedules, and delivery', async () => {
    const { app, env, sqlite } = fixture();
    delete env.TELEGRAM_ENABLED;
    const cap = await app.request('/api/telegram/capabilities', {}, env);
    expect(await cap.json()).toEqual({ enabled: false });
    expect((await app.request('/api/telegram/settings/status', {}, env)).status).toBe(404);
    const response = await app.request('/api/telegram/webhook', { method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': 'fixture-secret' }, body: '{"update_id":100}' }, env);
    expect(response.status).toBe(404);
    await processUpdate(env, { update_id: 10, message: { message_id: 1, from: { id: 123 }, chat: { id: -456, type: 'supergroup' }, text: '/addplayer Hidden' } });
    await runTelegramSchedule(env, '20 6 * * *', Date.now());
    await enqueue(env, 'direct', '123', { text: 'queued' });
    await deliver(env);
    expect(sqlite.prepare('SELECT count(*) n FROM telegram_updates').get()).toEqual({ n: 0 });
    expect(sqlite.prepare('SELECT count(*) n FROM telegram_drafts').get()).toEqual({ n: 0 });
    expect(sqlite.prepare('SELECT status FROM telegram_outbox').get()).toEqual({ status: 'pending' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('requires the literal enabled value and all three bot ENV values', async () => {
    const { app, env } = fixture();
    for (const flag of ['false', '1', 'TRUE', '']) {
      env.TELEGRAM_ENABLED = flag;
      expect(await (await app.request('/api/telegram/capabilities', {}, env)).json()).toEqual({ enabled: false });
    }
    env.TELEGRAM_ENABLED = 'true';
    delete env.TELEGRAM_BOT_TOKEN;
    expect(await (await app.request('/api/telegram/capabilities', {}, env)).json()).toEqual({ enabled: false });
  });
  it('allows only a verified owner of the selected tournament to bind or change group settings', async () => {
    const { app, env, sqlite } = fixture();
    const login = await app.request('/fixture-session/other', { method: 'POST' }, env);
    const headers = { Cookie: login.headers.get('set-cookie')!.split(';')[0], 'x-tournament-id': 'cup', 'x-user-id': 'other', 'Content-Type': 'application/json' };
    const post = (path: string, body: object) => app.request(`/api/telegram/settings/${path}`, { method: 'POST', headers, body: JSON.stringify(body) }, env);
    expect((await post('token', { purpose: 'group' })).status).toBe(403);
    expect((await post('config', { disconnect: true })).status).toBe(403);
    sqlite.prepare("INSERT INTO telegram_tokens (hash,user_id,tournament_id,purpose,expires_at,telegram_id,chat_id,chat_title) VALUES ('foreign','other','cup2','group',?,'999','-999','Foreign')").run(Date.now() + 60000);
    expect((await post('confirm', { id: 'foreign' })).status).toBe(403);
    expect(sqlite.prepare("SELECT chat_id FROM bilac_telegram WHERE tournament_id='cup'").get()).toEqual({ chat_id: '-456' });
  });
  it('rejects a callback copied to another group and a match reference from another tournament', async () => {
    const { env, sqlite } = fixture();
    const message = { message_id: 1, from: { id: 999 }, chat: { id: -456, type: 'supergroup' }, text: '/addplayer Safe' };
    await processUpdate(env, { update_id: 20, message });
    await processUpdate(env, { update_id: 21, callback_query: { id: 'c', from: { id: 999 }, data: 'add:k:0', message: { ...message, chat: { id: -789, type: 'supergroup' } } } });
    expect(sqlite.prepare("SELECT count(*) n FROM bilac_players WHERE name='Safe'").get()).toEqual({ n: 0 });
    sqlite.exec("INSERT INTO bilac_matches (id,tournament_id,timestamp,week_label,team1,team2,score1,score2,status) VALUES ('foreign-match','cup2',0,'week','[]','[]',0,0,'PLAYING')");
    await processUpdate(env, { update_id: 22, message: { ...message, text: '/score foreign-match 10 7' } });
    expect(sqlite.prepare("SELECT count(*) n FROM telegram_drafts WHERE kind='score'").get()).toEqual({ n: 0 });
  });
  it('invalidates old buttons and queued updates/deliveries after rebinding even to the same group', async () => {
    const { env, sqlite } = fixture();
    const bindingId = (sqlite.prepare("SELECT binding_id FROM bilac_telegram WHERE tournament_id='cup'").get() as { binding_id: string }).binding_id;
    const message = { message_id: 1, from: { id: 123 }, chat: { id: -456, type: 'supergroup' }, text: '/addplayer Previous' };
    await processUpdate(env, { update_id: 30, message, bindingId });
    await enqueue(env, 'old-job', '-456', { text: 'old standings' }, 'cup', Date.now(), bindingId);
    sqlite.prepare("UPDATE bilac_telegram SET binding_id='new-binding' WHERE tournament_id='cup'").run();
    await processUpdate(env, { update_id: 31, callback_query: { id: 'c', from: { id: 123 }, data: 'add:u:0', message } });
    await processUpdate(env, { update_id: 32, message: { ...message, text: '/addplayer Delayed' }, bindingId });
    await deliver(env);
    expect(sqlite.prepare("SELECT count(*) n FROM bilac_players WHERE name IN ('Previous','Delayed')").get()).toEqual({ n: 0 });
    expect(sqlite.prepare("SELECT status FROM telegram_outbox WHERE id='old-job'").get()).toEqual({ status: 'cancelled' });
  });
  it('rejects old drafts and accepted commands after relinking the same Telegram ID to a different account', async () => {
    const { env, sqlite } = fixture();
    const bindingId = (sqlite.prepare("SELECT binding_id FROM bilac_telegram WHERE tournament_id='cup'").get() as { binding_id: string }).binding_id;
    const linkId = (sqlite.prepare("SELECT link_id FROM telegram_links WHERE telegram_id='123'").get() as { link_id: string }).link_id;
    const message = { message_id: 1, from: { id: 123 }, chat: { id: -456, type: 'supergroup' }, text: '/addplayer Old identity' };
    await processUpdate(env, { update_id: 40, message });
    sqlite.exec("DELETE FROM telegram_links WHERE telegram_id IN ('123','999'); INSERT INTO telegram_links (telegram_id,user_id) VALUES ('123','other')");
    await processUpdate(env, { update_id: 41, callback_query: { id: 'c', from: { id: 123 }, data: 'add:14:0', message } });
    await processUpdate(env, { update_id: 42, message: { ...message, text: '/addplayer Delayed identity' }, bindingId, linkId });
    expect(sqlite.prepare("SELECT count(*) n FROM bilac_players WHERE name IN ('Old identity','Delayed identity')").get()).toEqual({ n: 0 });
  });
  it('checks binding and account generation in the match mutation transaction', async () => {
    const { env, sqlite } = fixture();
    const id = (sqlite.prepare("SELECT binding_id FROM bilac_telegram WHERE tournament_id='cup'").get() as { binding_id: string }).binding_id;
    const linkId = (sqlite.prepare("SELECT link_id FROM telegram_links WHERE telegram_id='123'").get() as { link_id: string }).link_id;
    const actor = { id, linkId, chatId: '-456', telegramId: '123' };
    sqlite.exec("UPDATE bilac_telegram SET binding_id='replacement' WHERE tournament_id='cup'");
    await expect(createBiLacMatch(env, 'cup', 'owner', ['a','b'], 'stale-binding', actor)).rejects.toThrow();
    expect(sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 0 });
    const match = await createBiLacMatch(env, 'cup', 'owner', ['a','b'], 'web-match');
    await expect(saveBiLacScore(env, 'cup', 'owner', match, [10,7], true, 'stale-score', actor)).rejects.toThrow();
    const currentActor = { ...actor, id: 'replacement' };
    sqlite.exec("DELETE FROM telegram_links WHERE telegram_id='123'; INSERT INTO telegram_links (telegram_id,user_id) VALUES ('123','owner')");
    await expect(saveBiLacScore(env, 'cup', 'owner', match, [10,7], true, 'old-link', currentActor)).rejects.toThrow();
    expect(sqlite.prepare('SELECT score1,score2 FROM bilac_matches').get()).toEqual({ score1: 0, score2: 0 });
  });
  it('rechecks owner membership after the external admin check before binding a group', async () => {
    const { app, env, sqlite } = fixture();
    const login = await app.request('/fixture-session/owner', { method: 'POST' }, env);
    const headers = { Cookie: login.headers.get('set-cookie')!.split(';')[0], 'x-tournament-id': 'cup', 'Content-Type': 'application/json' };
    const linkId = (sqlite.prepare("SELECT link_id FROM telegram_links WHERE telegram_id='123'").get() as { link_id: string }).link_id;
    sqlite.prepare("INSERT INTO telegram_tokens (hash,user_id,tournament_id,purpose,expires_at,telegram_id,chat_id,chat_title,link_id) VALUES ('staged','owner','cup','group',?,'123','-999','New group',?)").run(Date.now()+60000, linkId);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      sqlite.exec("UPDATE bilac_tournament_members SET role='member' WHERE id='m'");
      return new Response(JSON.stringify({ ok: true, result: { status: 'administrator' } }));
    }));
    const response = await app.request('/api/telegram/settings/confirm', { method: 'POST', headers, body: '{"id":"staged"}' }, env);
    expect(response.status).toBe(409);
    expect(sqlite.prepare("SELECT chat_id FROM bilac_telegram WHERE tournament_id='cup'").get()).toEqual({ chat_id: '-456' });
  });
  it('filters table requests by the actual source group even for a user who belongs to both tournaments', async () => {
    const { env, sqlite } = fixture();
    await processUpdate(env, { update_id: 50, message: { message_id: 1, from: { id: 999 }, chat: { id: -789, type: 'supergroup' }, text: '/bxh' } });
    const row = sqlite.prepare("SELECT tournament_id,chat_id,payload FROM telegram_outbox WHERE id='update:50'").get() as { tournament_id: string; chat_id: string; payload: string };
    expect(row.tournament_id).toBe('cup2'); expect(row.chat_id).toBe('-789');
    expect(JSON.parse(row.payload).text).toContain('Second Cup');
    expect(JSON.parse(row.payload).text).not.toContain('/bilac/12345678');
  });

  it('does not let an old in-flight migration response overwrite a replacement group', async () => {
    const { env, sqlite } = fixture();
    const id = (sqlite.prepare("SELECT binding_id FROM bilac_telegram WHERE tournament_id='cup'").get() as { binding_id: string }).binding_id;
    await enqueue(env, 'in-flight', '-456', { text: 'table' }, 'cup', Date.now(), id);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      sqlite.exec("UPDATE bilac_telegram SET binding_id='new',chat_id='-222',health='New status' WHERE tournament_id='cup'");
      return new Response(JSON.stringify({ ok: false, error_code: 400, parameters: { migrate_to_chat_id: -333 } }));
    }));
    await deliver(env);
    expect(sqlite.prepare("SELECT chat_id,health FROM bilac_telegram WHERE tournament_id='cup'").get()).toEqual({ chat_id: '-222', health: 'New status' });
    await deliver(env);
    expect(sqlite.prepare("SELECT status FROM telegram_outbox WHERE id='in-flight'").get()).toEqual({ status: 'cancelled' });
  });

  it.each(['binding', 'link'])('keeps the ingress %s generation when it changes during asynchronous reads', async kind => {
    const { env, sqlite } = fixture();
    const bindingId = (sqlite.prepare("SELECT binding_id FROM bilac_telegram WHERE tournament_id='cup'").get() as { binding_id: string }).binding_id;
    const linkId = (sqlite.prepare("SELECT link_id FROM telegram_links WHERE telegram_id='123'").get() as { link_id: string }).link_id;
    const original = env.DB.prepare.bind(env.DB);
    let changed = false;
    vi.spyOn(env.DB, 'prepare').mockImplementation(sql => {
      const statement = original(sql);
      const target = kind === 'binding' ? 'SELECT binding_id FROM bilac_telegram WHERE chat_id=? AND enabled=1' : 'SELECT link_id FROM telegram_links WHERE telegram_id=?';
      if (sql === target && !changed) {
        const first = statement.first.bind(statement);
        Object.assign(statement, { first: async () => {
          const result = await first();
          changed = true;
          if (kind === 'binding') sqlite.exec("UPDATE bilac_telegram SET binding_id='during-read' WHERE tournament_id='cup'");
          else sqlite.exec("DELETE FROM telegram_links WHERE telegram_id='123'; INSERT INTO telegram_links (telegram_id,user_id) VALUES ('123','owner')");
          return result;
        } });
      }
      return statement;
    });
    await processUpdate(env, { update_id: 60, bindingId, linkId, message: { message_id: 1, from: { id: 123 }, chat: { id: -456, type: 'supergroup' }, text: '/addplayer Asynchronous' } });
    expect(changed).toBe(true);
    expect(sqlite.prepare('SELECT count(*) n FROM telegram_drafts').get()).toEqual({ n: 0 });
  });

});
