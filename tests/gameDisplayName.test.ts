import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameDisplayName } from '../src/lib/gameDisplayName.ts';
import { GAMES } from '../src/gamesData.ts';

test('returns the raw game name unchanged', () => {
  assert.equal(gameDisplayName(GAMES.find(g => g.id === 'caro')!), 'Caro');
  assert.equal(gameDisplayName(GAMES.find(g => g.id === 'co_tuong')!), 'Cờ Tướng');
  assert.equal(gameDisplayName(GAMES.find(g => g.id === 'co_vua')!), 'Cờ Vua');
  assert.equal(gameDisplayName(GAMES.find(g => g.id === 'co_ca_ngua')!), 'Cờ Cá Ngựa');
  assert.equal(gameDisplayName(GAMES.find(g => g.id === 'o_an_quan')!), 'Ô Ăn Quan');
  assert.equal(gameDisplayName(GAMES.find(g => g.id === 'duoi_hinh_bat_chu')!), 'Đuổi Hình Bắt Chữ');
});

test('never doubles the Cờ prefix', () => {
  for (const g of GAMES) {
    assert.ok(!gameDisplayName(g).startsWith('Cờ Cờ'), `doubled prefix for ${g.id}`);
  }
});

test('falls back to empty string for unknown game', () => {
  assert.equal(gameDisplayName(undefined), '');
});
