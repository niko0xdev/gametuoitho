import { Hono } from 'hono';
import type { Bindings } from '../src/db';
import { issueSession } from '../src/lib/session';
import { bilacRoute } from '../src/routes/bilac';
import { describe, expect, it } from 'vitest';
import { pairFourPlayers } from '../src/lib/pairing';
import { testDatabase } from './telegram-db';
import { createBiLacMatch, saveBiLacScore } from '../src/lib/bilac-actions';
import { currentSeason, standings } from '../../shared/bilac-telegram';

const players = (count: number) => Array.from({ length: count }, (_, i) => ({ id: 'p' + i }));

describe('Timeout mode', () => {
  it.each([4, 5, 6, 9, 20])('selects exactly four of %s players without losing or duplicating anyone', count => {
    const roster = players(count);
    const before = JSON.stringify(roster);
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = pairFourPlayers(roster);
      expect(result.teamA).toHaveLength(2);
      expect(result.teamB).toHaveLength(2);
      expect(result.sittingOut).toHaveLength(count - 4);
      expect(new Set([...result.teamA, ...result.teamB, ...result.sittingOut].map(p => p.id))).toEqual(new Set(roster.map(p => p.id)));
    }
    expect(JSON.stringify(roster)).toBe(before);
  });
  it('requires at least four players and honours a deterministic RNG', () => {
    for (const count of [0, 1, 2, 3]) expect(() => pairFourPlayers(players(count))).toThrow('4');
    expect(pairFourPlayers(players(8), () => 0.5)).toEqual(pairFourPlayers(players(8), () => 0.5));
  });
  it.each([1, 10])('persists everyone sitting out and scores only the playing four with multiplier %s', async multiplier => {
    const { env, sqlite } = testDatabase();
    sqlite.exec("INSERT INTO bilac_players (id,name,avatar,tournament_id) VALUES ('d','Dung','','cup'),('e','Em','','cup'),('f','Phuc','','cup')");
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const match = await createBiLacMatch(env, 'cup', 'owner', ids, 'timeout', undefined, undefined, multiplier, 'timeout');
    expect(match.match_mode).toBe('timeout');
    const outside = JSON.parse(match.sitting_out!);
    const playing = [...JSON.parse(match.team1), ...JSON.parse(match.team2)];
    expect(playing).toHaveLength(4);
    expect(outside).toHaveLength(2);
    expect(new Set([...playing, ...outside])).toEqual(new Set(ids));
    expect(match.benched).toBeNull();
    await expect(createBiLacMatch(env, 'cup', 'owner', ids, 'timeout', undefined, undefined, multiplier, 'normal')).rejects.toThrow('chế độ');
    await saveBiLacScore(env, 'cup', 'owner', match, [7, 6], true, 'finish');
    const matches = sqlite.prepare('SELECT * FROM bilac_matches').all() as typeof match[];
    expect(matches).toHaveLength(multiplier);
    for (const result of matches) expect([result.match_mode, result.sitting_out]).toEqual(['timeout', match.sitting_out]);
    const rows = standings(ids.map(id => ({ id, name: id })), matches.map(m => ({ ...m, team1: JSON.parse(m.team1), team2: JSON.parse(m.team2), weekLabel: m.week_label })), currentSeason());
    expect(rows).toHaveLength(4);
    expect(rows.every(row => row.played === multiplier && !outside.includes(row.id))).toBe(true);
    sqlite.prepare("UPDATE bilac_matches SET score1=6,score2=7,revision=revision+1 WHERE id='timeout'").run();
    expect(sqlite.prepare("SELECT count(*) n FROM bilac_matches WHERE match_mode='timeout' AND sitting_out=? AND score1=6 AND score2=7").get(match.sitting_out)).toEqual({ n: multiplier });
  });
  it('validates web mode and returns the complete roster without enrolling people from another tournament', async () => {
    const { env, sqlite } = testDatabase();
    sqlite.exec("INSERT INTO bilac_players (id,name,avatar,tournament_id) VALUES ('d','Dung','','cup'),('e','Em','','cup'),('foreign','Other','','another-cup')");
    const app = new Hono<{ Bindings: Bindings }>();
    app.post('/fixture-session', async c => { await issueSession(c, 'owner'); return c.json({ ok: true }); });
    app.route('/api/bilac', bilacRoute);
    const session = await app.request('/fixture-session', { method: 'POST' }, env);
    const headers = { Cookie: session.headers.get('set-cookie')!.split(';')[0], 'x-user-id': 'owner', 'x-tournament-id': 'cup', 'x-tournament-code': 'private', 'Content-Type': 'application/json' };
    const create = (body: unknown) => app.request('/api/bilac/matches', { method: 'POST', headers, body: JSON.stringify(body) }, env);
    expect((await create({ playerIds: ['a', 'b', 'c'], matchMode: 'timeout' })).status).toBe(400);
    expect((await create({ playerIds: ['a', 'b', 'c', 'd'], matchMode: 'bad' })).status).toBe(400);
    expect((await create({ playerIds: ['a', 'b', 'c', 'foreign'], matchMode: 'timeout' })).status).toBe(409);
    const response = await create({ playerIds: ['a', 'b', 'c', 'd', 'e'], matchMode: 'timeout', resultMultiplier: 10 });
    expect(response.status).toBe(200);
    const match = await response.json() as { id: string; matchMode: string; team1: string[]; team2: string[]; sittingOut: string[] };
    expect(match.matchMode).toBe('timeout');
    expect(match.team1).toHaveLength(2); expect(match.team2).toHaveLength(2); expect(match.sittingOut).toHaveLength(1);
    expect(new Set([...match.team1, ...match.team2, ...match.sittingOut])).toEqual(new Set(['a', 'b', 'c', 'd', 'e']));
    const invalidRoster = await app.request(`/api/bilac/matches/${match.id}/update`, { method: 'POST', headers, body: JSON.stringify({ team1: [match.team1[0]], team2: [match.team1[1], ...match.team2], benched: null }) }, env);
    expect(invalidRoster.status).toBe(400);
    const get = await app.request('/api/bilac/matches', { headers }, env);
    expect(await get.json()).toMatchObject([{ matchMode: 'timeout', sittingOut: match.sittingOut }]);
  });
  it('rejects insufficient or foreign players without creating a match', async () => {
    const { env, sqlite } = testDatabase();
    await expect(createBiLacMatch(env, 'cup', 'owner', ['a', 'b', 'c'], 'short', undefined, undefined, 1, 'timeout')).rejects.toThrow('4');
    await expect(createBiLacMatch(env, 'cup', 'owner', ['a', 'b', 'c', 'foreign'], 'foreign', undefined, undefined, 1, 'timeout')).rejects.toThrow();
    expect(sqlite.prepare('SELECT count(*) n FROM bilac_matches').get()).toEqual({ n: 0 });
  });
});
