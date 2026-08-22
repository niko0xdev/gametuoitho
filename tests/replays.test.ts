import { describe, it, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { getApp, request } from './_bootstrap.ts';
import { db } from '../server/db.ts';

beforeAll(() => { getApp(); });

describe('GET /api/replays/:userId', () => {
  it('returns ended matches of user', async () => {
    db.saveMatch({
      id: 'rep_1', gameId: 'caro', status: 'ENDED', players: ['r_u1', 'r_u2'],
      boardState: {}, turn: 'r_u1', moves: [], viewers: [], winner: 'r_u1',
      createdAt: Date.now(), updatedAt: Date.now()
    });
    db.saveMatch({
      id: 'rep_2', gameId: 'caro', status: 'PLAYING', players: ['r_u1', 'r_u3'],
      boardState: {}, turn: 'r_u1', moves: [], viewers: [], winner: undefined,
      createdAt: Date.now(), updatedAt: Date.now()
    });
    const res = await request(getApp()).get('/api/replays/r_u1');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.some((m: any) => m.id === 'rep_1'));
    assert.ok(!res.body.some((m: any) => m.id === 'rep_2'));
  });
  it('returns empty array for user with no matches', async () => {
    const res = await request(getApp()).get('/api/replays/__nobody__');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });
});

describe('GET /api/replay/:matchId', () => {
  it('returns 404 for unknown match', async () => {
    const res = await request(getApp()).get('/api/replay/__nope__');
    assert.equal(res.status, 404);
  });
  it('returns 200 for known match', async () => {
    db.saveMatch({
      id: 'rep_known', gameId: 'caro', status: 'ENDED', players: ['p1'],
      boardState: {}, turn: 'p1', moves: [], viewers: [], winner: 'p1',
      createdAt: Date.now(), updatedAt: Date.now()
    });
    const res = await request(getApp()).get('/api/replay/rep_known');
    assert.equal(res.status, 200);
    assert.equal(res.body.id, 'rep_known');
  });
});