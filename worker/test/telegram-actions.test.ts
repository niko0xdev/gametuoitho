import { afterEach, describe, expect, it, vi } from 'vitest';
import { testDatabase } from './telegram-db';
import { createBiLacMatch, saveBiLacScore } from '../src/lib/bilac-actions';
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
