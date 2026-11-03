import type { Bindings } from '../src/db';
import { Hono } from 'hono';
import { bilacRoute } from '../src/routes/bilac';
import { issueSession } from '../src/lib/session';
import { describe, expect, it } from 'vitest';
import { testDatabase } from './telegram-db';
import { createBiLacMatch, saveBiLacScore, cancelBiLacMatch, type StoredMatch } from '../src/lib/bilac-actions';
import { currentSeason, standings } from '../../shared/bilac-telegram';

describe('Ten-result matches', () => {
  it('creates one playing match, then ten identical results exactly once', async () => {
    const { env, sqlite } = testDatabase();
    const match = await createBiLacMatch(env, 'cup', 'owner', ['a', 'b'], 'series', undefined, undefined, 10);
    expect(sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 1 });
    expect(match.result_multiplier).toBe(10);
    await saveBiLacScore(env, 'cup', 'owner', match, [7, 6], false, 'partial');
    expect(sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 1 });
    const updated = sqlite.prepare("SELECT * FROM bilac_matches WHERE id='series'").get() as StoredMatch;
    await saveBiLacScore(env, 'cup', 'owner', updated, [7, 6], true, 'finish');
    await saveBiLacScore(env, 'cup', 'owner', updated, [7, 6], true, 'finish');
    const matches = sqlite.prepare('SELECT * FROM bilac_matches').all() as StoredMatch[];
    expect(matches).toHaveLength(10);
    for (const row of matches) {
      expect([row.team1, row.team2, row.score1, row.score2, row.status, row.week_label, row.timestamp, row.tournament_id])
        .toEqual([match.team1, match.team2, 7, 6, 'FINISHED', match.week_label, match.timestamp, 'cup']);
    }
    const rows = standings([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], matches.map(m => ({ ...m, team1: JSON.parse(m.team1), team2: JSON.parse(m.team2), weekLabel: m.week_label })), currentSeason());
    expect(rows.map(r => r.played)).toEqual([10, 10]);
    await expect(saveBiLacScore(env, 'cup', 'owner', updated, [6, 7], true, 'stale')).rejects.toThrow('đã thay đổi');
    expect(sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 10 });
  });
  it('also expands web updates, synchronises corrections, and removes copies when reopened or deleted', async () => {
    const { env, sqlite } = testDatabase();
    await createBiLacMatch(env, 'cup', 'owner', ['a', 'b'], 'series', undefined, undefined, 10);
    sqlite.exec("UPDATE bilac_matches SET score1=10,score2=7,status='FINISHED',revision=revision+1 WHERE id='series'");
    expect(sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 10 });
    sqlite.exec("UPDATE bilac_matches SET score1=6,score2=7,revision=revision+1 WHERE id='series'");
    expect(sqlite.prepare('SELECT count(*) n FROM bilac_matches WHERE score1=6 AND score2=7').get()).toEqual({ n: 10 });
    sqlite.exec("UPDATE bilac_matches SET status='PLAYING' WHERE id='series'");
    expect(sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 1 });
    sqlite.exec("UPDATE bilac_matches SET status='FINISHED' WHERE id='series'");
    expect(sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 10 });
    sqlite.exec("DELETE FROM bilac_matches WHERE id='series'");
    expect(sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 0 });
  });
  it('keeps ordinary matches unchanged and rejects invalid multipliers', async () => {
    const { env, sqlite } = testDatabase();
    await expect(createBiLacMatch(env, 'cup', 'owner', ['a', 'b'], 'invalid', undefined, undefined, 100)).rejects.toThrow();
    const match = await createBiLacMatch(env, 'cup', 'owner', ['a', 'b'], 'normal');
    await saveBiLacScore(env, 'cup', 'owner', match, [6, 7], true, 'finish');
    expect(sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 1 });
  });
  it('requires managing generated results through the original match', async () => {
    const { env, sqlite } = testDatabase();
    const match = await createBiLacMatch(env, 'cup', 'owner', ['a', 'b'], 'series', undefined, undefined, 10);
    await saveBiLacScore(env, 'cup', 'owner', match, [7, 6], true, 'finish');
    const copy = sqlite.prepare("SELECT * FROM bilac_matches WHERE source_match_id='series' LIMIT 1").get() as StoredMatch;
    await expect(saveBiLacScore(env, 'cup', 'owner', copy, [6, 7], true, 'edit-copy')).rejects.toThrow('trận gốc');
    await expect(cancelBiLacMatch(env, 'cup', 'owner', copy, 'cancel-copy', { id: 'fixture', chatId: '-456', telegramId: '123', linkId: 'fixture' })).rejects.toThrow('trận gốc');
    expect(sqlite.prepare("SELECT count(*) n FROM bilac_matches WHERE status='FINISHED' AND score1=7 AND score2=6").get()).toEqual({ n: 10 });
  });
  it('protects copies on web routes while allowing owner corrections on the original', async () => {
    const { env, sqlite } = testDatabase();
    const match = await createBiLacMatch(env, 'cup', 'owner', ['a', 'b'], 'series', undefined, undefined, 10);
    await saveBiLacScore(env, 'cup', 'owner', match, [7, 6], true, 'finish');
    const app = new Hono<{ Bindings: Bindings }>();
    app.post('/fixture-session', async c => { await issueSession(c, 'owner'); return c.json({ ok: true }); });
    app.route('/api/bilac', bilacRoute);
    const session = await app.request('/fixture-session', { method: 'POST' }, env);
    const headers = { Cookie: session.headers.get('set-cookie')!.split(';')[0], 'x-user-id': 'owner', 'x-tournament-id': 'cup', 'x-tournament-code': 'private', 'Content-Type': 'application/json' };
    expect((await app.request('/api/bilac/matches/series-x10-2/update', { method: 'POST', headers, body: '{"status":"PLAYING"}' }, env)).status).toBe(409);
    expect((await app.request('/api/bilac/matches/series-x10-2', { method: 'DELETE', headers }, env)).status).toBe(409);
    expect((await app.request('/api/bilac/matches/series/update', { method: 'POST', headers, body: '{"score1":6,"score2":7,"expectedRevision":1}' }, env)).status).toBe(200);
    expect(sqlite.prepare('SELECT count(*) n FROM bilac_matches WHERE score1=6 AND score2=7').get()).toEqual({ n: 10 });
    expect((await app.request('/api/bilac/matches/series', { method: 'DELETE', headers }, env)).status).toBe(200);
    expect(sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 0 });
  });
  it.each([1, 10])('creates and finishes a web match with multiplier %s', async resultMultiplier => {
    const { env, sqlite } = testDatabase();
    const app = new Hono<{ Bindings: Bindings }>();
    app.post('/fixture-session', async c => { await issueSession(c, 'owner'); return c.json({ ok: true }); });
    app.route('/api/bilac', bilacRoute);
    const session = await app.request('/fixture-session', { method: 'POST' }, env);
    const headers = { Cookie: session.headers.get('set-cookie')!.split(';')[0], 'x-user-id': 'owner', 'x-tournament-id': 'cup', 'x-tournament-code': 'private', 'Content-Type': 'application/json' };
    for (const invalid of [0, 2, 100, '10', null]) {
      expect((await app.request('/api/bilac/matches', { method: 'POST', headers, body: JSON.stringify({ playerIds: ['a', 'b'], resultMultiplier: invalid }) }, env)).status).toBe(400);
    }
    const response = await app.request('/api/bilac/matches', { method: 'POST', headers, body: JSON.stringify({ playerIds: ['a', 'b'], resultMultiplier }) }, env);
    expect(response.status).toBe(200);
    const match = await response.json() as { id: string; resultMultiplier: number; revision: number };
    expect(match.resultMultiplier).toBe(resultMultiplier);
    expect(sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 1 });
    const finish = await app.request(`/api/bilac/matches/${match.id}/update`, { method: 'POST', headers, body: JSON.stringify({ score1: 7, score2: 6, status: 'FINISHED', expectedRevision: match.revision }) }, env);
    expect(finish.status).toBe(200);
    const result = await finish.json() as { seriesMatches?: Array<{ id: string; score1: number; score2: number; sourceMatchId: string | null }> };
    if (resultMultiplier === 10) {
      expect(result.seriesMatches).toHaveLength(10);
      expect(result.seriesMatches!.filter(m => m.sourceMatchId === match.id)).toHaveLength(9);
      expect(result.seriesMatches!.every(m => m.score1 === 7 && m.score2 === 6)).toBe(true);
    }
    expect(sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: resultMultiplier });
    const stale = await app.request(`/api/bilac/matches/${match.id}/update`, { method: 'POST', headers, body: JSON.stringify({ score1: 6, score2: 7, status: 'FINISHED', expectedRevision: match.revision }) }, env);
    expect(stale.status).toBe(409);
    expect(sqlite.prepare('SELECT count(*) n FROM bilac_matches WHERE score1=7 AND score2=6').get()).toEqual({ n: resultMultiplier });
  });
  it('rolls back the score and audit if a copy cannot be inserted', async () => {
    const { env, sqlite } = testDatabase();
    const match = await createBiLacMatch(env, 'cup', 'owner', ['a', 'b'], 'series', undefined, undefined, 10);
    sqlite.exec("CREATE TRIGGER fixture_copy_failure BEFORE INSERT ON bilac_matches WHEN NEW.source_match_id IS NOT NULL BEGIN SELECT RAISE(ABORT, 'Fixture failure'); END;");
    await expect(saveBiLacScore(env, 'cup', 'owner', match, [7, 6], true, 'finish')).rejects.toThrow('Fixture failure');
    expect(sqlite.prepare("SELECT status,revision FROM bilac_matches WHERE id='series'").get()).toEqual({ status: 'PLAYING', revision: 0 });
    expect(sqlite.prepare("SELECT 1 FROM bilac_telegram_audit WHERE operation_id='finish'").get()).toBeUndefined();
  });
});
