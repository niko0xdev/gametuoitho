import { test } from 'vitest';
import assert from 'node:assert/strict';
import { knockoutWinner } from '../src/lib/knockout.ts';

test('home wins when ahead', () => {
  assert.equal(knockoutWinner('home1', 'away1', 3, 1), 'home1');
});

test('away wins when ahead', () => {
  assert.equal(knockoutWinner('home1', 'away1', 0, 2), 'away1');
});

test('draw returns null — never falls through to the away team', () => {
  assert.equal(knockoutWinner('home1', 'away1', 1, 1), null);
  assert.equal(knockoutWinner('home1', 'away1', 0, 0), null);
});
