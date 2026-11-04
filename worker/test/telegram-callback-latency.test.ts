import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { testDatabase } from './telegram-db';
import { telegramRoute } from '../src/routes/telegram';
import { createBiLacMatch } from '../src/lib/bilac-actions';
import { processUpdate, publishMatchCard } from '../src/lib/telegram-commands';

afterEach(() => vi.unstubAllGlobals());
describe('Telegram quick-result latency', () => {
  it.each(['wa','wb'])('shows the %s confirmation within eight database round trips', async action => {
    const { env, sqlite } = testDatabase();
    Object.assign(env, { TELEGRAM_ENABLED: 'true', TELEGRAM_BOT_TOKEN: 'fixture', TELEGRAM_BOT_USERNAME: 'fixture_bot', TELEGRAM_WEBHOOK_SECRET: 'fixture-secret' });
    sqlite.exec("INSERT INTO telegram_links (telegram_id,user_id) VALUES ('123','owner'); INSERT INTO bilac_telegram (tournament_id,chat_id,chat_title,connected_by) VALUES ('cup','-456','Group','owner')");
    const match = await createBiLacMatch(env, 'cup', 'owner', ['a','b'], 'match');
    const binding = sqlite.prepare('SELECT binding_id FROM bilac_telegram').get() as { binding_id: string };
    const link = sqlite.prepare('SELECT link_id FROM telegram_links').get() as { link_id: string };
    await publishMatchCard(env, match, { id: 'initial', tournament_id: 'cup', chat_id: '-456', binding_id: binding.binding_id, telegram_id: '123', user_id: 'owner', link_id: link.link_id });
    sqlite.exec("UPDATE telegram_outbox SET status='sent'");
    let trips = 0;
    const prepare = env.DB.prepare.bind(env.DB), batch = env.DB.batch.bind(env.DB);
    vi.spyOn(env.DB, 'prepare').mockImplementation(sql => {
      const statement = prepare(sql);
      for (const method of ['first','all','run'] as const) {
        const original = statement[method].bind(statement);
        Object.assign(statement, { [method]: (...args: unknown[]) => { trips++; return original(...args); } });
      }
      return statement;
    });
    vi.spyOn(env.DB, 'batch').mockImplementation(statements => { trips++; return batch(statements); });
    const sent: Array<{ text: string; reply_markup: { inline_keyboard: Array<Array<{ callback_data: string }>> } }> = [];
    let tripsBeforeConfirmation = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith('/sendMessage')) { tripsBeforeConfirmation = trips; sent.push(JSON.parse(String(init.body))); }
      return new Response(JSON.stringify({ ok: true, result: { message_id: 2 } }));
    }));
    const log = vi.spyOn(console, 'info');
    const app = new Hono(); app.route('/api/telegram', telegramRoute);
    const waits: Promise<unknown>[] = [];
    const response = await app.request('/api/telegram/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'fixture-secret' }, body: JSON.stringify({ update_id: 77, callback_query: { id: 'callback', from: { id: 123, username: 'fixture_owner' }, data: `${action}:minitial:0`, message: { message_id: 1, chat: { id: -456, type: 'supergroup' } } } }) }, env, { props: {}, waitUntil(p: Promise<unknown>) { waits.push(p); }, passThroughOnException() {} });
    expect(response.status).toBe(200); await Promise.all(waits);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain(action === 'wa' ? 'đội A thắng' : 'đội B thắng');
    expect(sent[0].reply_markup.inline_keyboard[0][0].callback_data).toBe('finish:q25:0');
    expect(sqlite.prepare("SELECT status FROM bilac_matches WHERE id='match'").get()).toEqual({ status: 'PLAYING' });
    expect(tripsBeforeConfirmation).toBeLessThanOrEqual(8);
    expect(log).toHaveBeenCalledWith('Telegram callback received', {
      updateId: 77, telegramId: '123', telegramUsername: 'fixture_owner', userId: 'owner', chatId: '-456', action, draftId: 'minitial',
    });
    expect(log.mock.calls.some(call => JSON.stringify(call).includes('fixture-secret'))).toBe(false);
    log.mockRestore();
  });
  it.each(['binding','link','membership','group'])('keeps the fast callback path closed after a %s change', async change => {
    const { env, sqlite } = testDatabase();
    Object.assign(env, { TELEGRAM_ENABLED: 'true', TELEGRAM_BOT_TOKEN: 'fixture', TELEGRAM_BOT_USERNAME: 'fixture_bot', TELEGRAM_WEBHOOK_SECRET: 'fixture-secret' });
    sqlite.exec("INSERT INTO telegram_links (telegram_id,user_id) VALUES ('123','owner'); INSERT INTO bilac_telegram (tournament_id,chat_id,chat_title,connected_by) VALUES ('cup','-456','Group','owner')");
    const match = await createBiLacMatch(env, 'cup', 'owner', ['a','b'], 'match');
    const binding = sqlite.prepare('SELECT binding_id FROM bilac_telegram').get() as { binding_id: string };
    const link = sqlite.prepare('SELECT link_id FROM telegram_links').get() as { link_id: string };
    await publishMatchCard(env, match, { id: 'initial', tournament_id: 'cup', chat_id: '-456', binding_id: binding.binding_id, telegram_id: '123', user_id: 'owner', link_id: link.link_id });
    if (change === 'binding') sqlite.exec("UPDATE bilac_telegram SET binding_id='replacement'");
    if (change === 'link') sqlite.exec("DELETE FROM telegram_links; INSERT INTO telegram_links (telegram_id,user_id) VALUES ('123','owner')");
    if (change === 'membership') sqlite.exec('DELETE FROM bilac_tournament_members');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: {} }))));
    await processUpdate(env, { update_id: 77, bindingId: binding.binding_id, linkId: link.link_id, callback_query: { id: 'callback', from: { id: 123 }, data: 'wa:minitial:0', message: { message_id: 1, chat: { id: change === 'group' ? -789 : -456, type: 'supergroup' } } } });
    expect(sqlite.prepare("SELECT count(*) n FROM telegram_drafts WHERE kind='score'").get()).toEqual({ n: 0 });
    expect(sqlite.prepare("SELECT count(*) n FROM telegram_outbox WHERE id LIKE 'quick:%'").get()).toEqual({ n: 0 });
    expect(sqlite.prepare("SELECT status FROM bilac_matches WHERE id='match'").get()).toEqual({ status: 'PLAYING' });
  });

});
