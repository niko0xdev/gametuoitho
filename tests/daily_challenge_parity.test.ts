import { describe, it, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { getApp } from './_bootstrap.ts';
import { db } from '../server/db.ts';

beforeAll(() => { getApp(); });

describe('daily_challenges composite PK parity (Batch 1)', () => {
  it('RED: two challenges on same date with different gameId both persist', () => {
    const date = `2026-08-22-${Math.random().toString(36).slice(2, 6)}`;
    db.saveDailyChallenge({
      id: `dc_caro_${date}`,
      date,
      gameId: 'caro',
      seed: 's1',
      prompt: 'p1',
      topScores: [],
    });
    db.saveDailyChallenge({
      id: `dc_cotuong_${date}`,
      date,
      gameId: 'co_tuong',
      seed: 's2',
      prompt: 'p2',
      topScores: [],
    });
    const a = db.getDailyChallenge(date, 'caro');
    const b = db.getDailyChallenge(date, 'co_tuong');
    assert.ok(a, 'caro challenge should exist');
    assert.ok(b, 'co_tuong challenge should exist');
    assert.equal(a!.gameId, 'caro');
    assert.equal(b!.gameId, 'co_tuong');
    assert.notEqual(a!.id, b!.id);
    assert.equal(a!.seed, 's1');
    assert.equal(b!.seed, 's2');
  });

  it('backward compat: single-date lookup without gameId still returns a challenge', () => {
    const date = `2026-08-23-${Math.random().toString(36).slice(2, 6)}`;
    db.saveDailyChallenge({
      id: `dc_single_${date}`,
      date,
      gameId: 'caro',
      seed: 'sx',
      prompt: 'px',
      topScores: [],
    });
    const c = db.getDailyChallenge(date);
    assert.ok(c, 'single-arg lookup should still work');
    assert.equal(c!.date, date);
  });
});
