import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { getApp, request } from './_bootstrap.ts';
import { db } from '../server/db.ts';

before(() => { getApp(); });

describe('GET /api/leaderboard/global', () => {
  it('returns sorted by honor score desc', async () => {
    const aId = `lbg_a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const bId = `lbg_b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const cId = `lbg_c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db.saveProfile({ id: aId, displayName: 'A', avatar: 'a', elo: {} as any, honorScore: 999000001, badges: [] });
    db.saveProfile({ id: bId, displayName: 'B', avatar: 'b', elo: {} as any, honorScore: 999000002, badges: [] });
    db.saveProfile({ id: cId, displayName: 'C', avatar: 'c', elo: {} as any, honorScore: 999000000, badges: [] });
    const res = await request(getApp()).get('/api/leaderboard/global');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    const idx = (id: string) => res.body.findIndex((p: any) => p.id === id);
    assert.ok(idx(bId) >= 0 && idx(aId) >= 0 && idx(cId) >= 0);
    assert.ok(idx(bId) < idx(aId));
    assert.ok(idx(aId) < idx(cId));
  });
});

describe('GET /api/leaderboard/:gameId', () => {
  it('returns sorted by elo desc', async () => {
    const aId = `lbelo_a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const bId = `lbelo_b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    // Use values guaranteed to be top 2 with large gaps (test pollution resistant).
    db.saveProfile({
      id: aId, displayName: 'A', avatar: 'a',
      elo: { caro: 2147483647 } as any, honorScore: 100, badges: []
    });
    db.saveProfile({
      id: bId, displayName: 'B', avatar: 'b',
      elo: { caro: 2147483646 } as any, honorScore: 100, badges: []
    });
    const res = await request(getApp()).get('/api/leaderboard/caro');
    assert.equal(res.status, 200);
    const aIdx = res.body.findIndex((p: any) => p.id === aId);
    const bIdx = res.body.findIndex((p: any) => p.id === bId);
    assert.ok(aIdx >= 0 && bIdx >= 0);
    assert.ok(aIdx < bIdx);
    assert.equal(res.body[aIdx].elo, 2147483647);
    assert.equal(res.body[bIdx].elo, 2147483646);
  });
  it('returns 1500 default for missing game elo', async () => {
    // Profile with extreme caro elo to ensure top ranking.
    const id = `lbelo_default_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db.saveProfile({
      id, displayName: 'D', avatar: 'd',
      elo: { caro: 2147483647 } as any, honorScore: 100, badges: []
    });
    // Request a different game — co_tuong not set on this profile → defaults to 1500.
    const other = await request(getApp()).get('/api/leaderboard/co_tuong');
    const me2 = other.body.find((p: any) => p.id === id);
    assert.ok(me2);
    assert.equal(me2.elo, 1500);
  });
});