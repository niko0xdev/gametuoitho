import { test } from 'vitest';
import assert from 'node:assert/strict';
import { normalizeRoomCode, isValidRoomCode } from '../src/lib/roomCode.ts';

test('normalizes a pasted room code to six uppercase alphanumerics', () => {
  assert.equal(normalizeRoomCode(' ab 12 cd '), 'AB12CD');
  assert.equal(normalizeRoomCode('ABC DEF'), 'ABCDEF');
  assert.equal(normalizeRoomCode('abcdefghi'), 'ABCDEF');
});

test('accepts only complete six-character room codes', () => {
  assert.equal(isValidRoomCode('AB12CD'), true);
  assert.equal(isValidRoomCode('ABCDE'), false);
  assert.equal(isValidRoomCode('AB-12C'), false);
});
