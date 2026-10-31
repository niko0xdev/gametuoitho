import { afterEach, describe, expect, it, vi } from 'vitest';
import { testDatabase } from './telegram-db';
import { createBiLacMatch, saveBiLacScore } from '../src/lib/bilac-actions';
import { processUpdate, recoverUpdates } from '../src/lib/telegram-commands';
import { deliver, enqueue } from '../src/lib/telegram-client';

afterEach(() => vi.unstubAllGlobals());
describe('Telegram persisted actions', () => {
  it('rejects outsiders and creates one active match even when replayed', async () => {
    const { env, sqlite } = testDatabase();
    await expect(createBiLacMatch(env, 'cup', 'other', ['a', 'b'], 'no')).rejects.toThrow();
    const match = await createBiLacMatch(env, 'cup', 'owner', ['a', 'b'], 'one');
    expect((await createBiLacMatch(env, 'cup', 'owner', ['a', 'b'], 'one')).id).toBe(match.id);
    await expect(createBiLacMatch(env, 'cup', 'owner', ['a', 'b'], 'two')).rejects.toThrow('chưa kết thúc');
    expect(sqlite.prepare('SELECT count(*) AS n FROM bilac_matches').get()).toEqual({ n: 1 });
  });
  it('detects web changes and makes a result confirmation idempotent', async () => {
    const { env, sqlite } = testDatabase();
    const match = await createBiLacMatch(env, 'cup', 'owner', ['a', 'b'], 'one');
    await saveBiLacScore(env, 'cup', 'owner', match, [10, 7], true, 'op');
    await saveBiLacScore(env, 'cup', 'owner', match, [10, 7], true, 'op');
    await expect(saveBiLacScore(env, 'cup', 'owner', match, [0, 0], true, 'stale')).rejects.toThrow('đã thay đổi');
    expect(sqlite.prepare('SELECT score1,revision FROM bilac_matches').get()).toEqual({ score1: 10, revision: 1 });
  });
  it('delivers the current response ahead of an older group backlog without resending it', async () => {
    const { env, sqlite } = testDatabase();
    Object.assign(env, { TELEGRAM_ENABLED: 'true', TELEGRAM_BOT_TOKEN: 'fixture', TELEGRAM_BOT_USERNAME: 'fixture_bot', TELEGRAM_WEBHOOK_SECRET: 'fixture-secret' });
    const sent: string[] = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)).text);
      return new Response(JSON.stringify({ ok: true, result: { message_id: sent.length } }));
    }));
    await enqueue(env, 'old', '-456', { text: 'Old table' }, null, 1000);
    await enqueue(env, 'current', '-456', { text: 'Current match' }, null, 2000);
    await deliver(env, 2000, ['current']);
    expect(sent).toEqual(['Current match']);
    expect(sqlite.prepare("SELECT status FROM telegram_outbox WHERE id='old'").get()).toEqual({ status: 'pending' });
    await deliver(env, 2000, ['current']);
    expect(sent).toEqual(['Current match']);
    await deliver(env, 2000);
    expect(sent).toEqual(['Current match', 'Old table']);
  });
  it('sends a new webhook reply before the existing group backlog', async () => {
    const { env, sqlite } = testDatabase();
    Object.assign(env, { TELEGRAM_ENABLED: 'true', TELEGRAM_BOT_TOKEN: 'fixture', TELEGRAM_BOT_USERNAME: 'fixture_bot', TELEGRAM_WEBHOOK_SECRET: 'fixture-secret' });
    sqlite.exec("INSERT INTO telegram_links (telegram_id,user_id) VALUES ('123','owner'); INSERT INTO bilac_telegram (tournament_id,chat_id,chat_title,connected_by) VALUES ('cup','-456','Group','owner')");
    const sent: string[] = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)).text);
      return new Response(JSON.stringify({ ok: true, result: { message_id: sent.length } }));
    }));
    await enqueue(env, 'old-table', '-456', { text: 'Old table' });
    sqlite.prepare('INSERT INTO telegram_updates (id,payload,created_at) VALUES (?,?,?)').run(55, JSON.stringify({ update_id: 55, message: { message_id: 1, from: { id: 123 }, chat: { id: -456, type: 'supergroup' }, text: '/help' } }), Date.now());
    await recoverUpdates(env);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('/random@fixture_bot');
    expect(sqlite.prepare("SELECT status FROM telegram_outbox WHERE id='old-table'").get()).toEqual({ status: 'pending' });
    expect(sqlite.prepare('SELECT status FROM telegram_updates WHERE id=55').get()).toEqual({ status: 'done' });
    await recoverUpdates(env);
    expect(sent).toHaveLength(1);
  });
  it('updates old score messages concurrently after committing the result', async () => {
    const { env, sqlite } = testDatabase();
    Object.assign(env, { TELEGRAM_ENABLED: 'true', TELEGRAM_BOT_TOKEN: 'fixture', TELEGRAM_BOT_USERNAME: 'fixture_bot', TELEGRAM_WEBHOOK_SECRET: 'fixture-secret' });
    sqlite.exec("INSERT INTO telegram_links (telegram_id,user_id) VALUES ('123','owner'); INSERT INTO bilac_telegram (tournament_id,chat_id,chat_title,connected_by) VALUES ('cup','-456','Group','owner')");
    const match = await createBiLacMatch(env, 'cup', 'owner', ['a','b'], 'match');
    sqlite.prepare(`INSERT INTO telegram_drafts (id,tournament_id,chat_id,telegram_id,kind,payload,expires_at,binding_id,user_id,link_id)
      SELECT 'confirmation','cup','-456','123','score',?,?,i.binding_id,'owner',l.link_id FROM bilac_telegram i JOIN telegram_links l ON l.user_id='owner' WHERE i.tournament_id='cup'`)
      .run(JSON.stringify({ match, scores: [7,6], sourceMessageId: 10 }), Date.now() + 60000);
    let active = 0, peak = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/editMessage')) {
        expect(sqlite.prepare("SELECT status FROM bilac_matches WHERE id='match'").get()).toEqual({ status: 'FINISHED' });
        peak = Math.max(peak, ++active);
        await new Promise(resolve => setTimeout(resolve, 10));
        active--;
      }
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }));
    }));
    await processUpdate(env, { update_id: 66, callback_query: { id: 'callback', from: { id: 123 }, data: 'finish:confirmation:0', message: { message_id: 11, chat: { id: -456, type: 'supergroup' } } } });
    expect(peak).toBe(2);
    expect(sqlite.prepare("SELECT consumed FROM telegram_drafts WHERE id='confirmation'").get()).toEqual({ consumed: 1 });
    expect(sqlite.prepare("SELECT status FROM telegram_outbox WHERE id='draft:confirmation'").get()).toEqual({ status: 'pending' });
  });
  it('never blindly retries an uncertain send and honours retry_after', async () => {
    const { env, sqlite } = testDatabase();
    Object.assign(env, { TELEGRAM_ENABLED: 'true', TELEGRAM_BOT_TOKEN: 'fixture', TELEGRAM_BOT_USERNAME: 'fixture_bot', TELEGRAM_WEBHOOK_SECRET: 'fixture-secret' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    await enqueue(env, 'one', '123', { text: 'test' }, null, 1000);
    await deliver(env, 1000);
    expect(sqlite.prepare('SELECT status FROM telegram_outbox').get()).toEqual({ status: 'unknown' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, error_code: 429, parameters: { retry_after: 60 } }))));
    await enqueue(env, 'two', '456', { text: 'test' }, null, 1000);
    await deliver(env, 1000);
    expect(sqlite.prepare("SELECT status,due_at FROM telegram_outbox WHERE id='two'").get()).toEqual({ status: 'pending', due_at: 61000 });
  });
});
