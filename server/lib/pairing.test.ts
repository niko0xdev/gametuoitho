import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pairPlayers, type Player } from './pairing.ts';

const mk = (n: number): Player[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` }));

describe('pairPlayers', () => {
  it('even N=8: rank1 & rankN cùng Team A; rank2 & rankN-1 cùng Team B', () => {
    const { teamA, teamB, sittingOut } = pairPlayers(mk(8));
    assert.equal(sittingOut, null);
    assert.equal(teamA.length, 4);
    assert.equal(teamB.length, 4);
    assert.ok(teamA.some(p => p.id === 'p1'));
    assert.ok(teamA.some(p => p.id === 'p8'));
    assert.ok(teamB.some(p => p.id === 'p2'));
    assert.ok(teamB.some(p => p.id === 'p7'));
  });

  it('even N=8: pairs theo spec — (1,8)→A (2,7)→B (3,6)→A (4,5)→B', () => {
    const { teamA, teamB } = pairPlayers(mk(8));
    const aIds = [...teamA].map(p => p.id).sort();
    const bIds = [...teamB].map(p => p.id).sort();
    assert.deepEqual(aIds, ['p1', 'p3', 'p6', 'p8']);
    assert.deepEqual(bIds, ['p2', 'p4', 'p5', 'p7']);
  });

  it('odd N=5 (rng=0): sittingOut=p1, teams chia đều', () => {
    const { teamA, teamB, sittingOut } = pairPlayers(mk(5), () => 0);
    assert.ok(sittingOut);
    assert.equal(sittingOut.id, 'p1');
    assert.equal(teamA.length, 2);
    assert.equal(teamB.length, 2);
  });

  it('odd N=5: sau khi loại, ghép (1,5)→A (2,4)→B', () => {
    const { teamA, teamB, sittingOut } = pairPlayers(mk(5), () => 0);
    assert.equal(sittingOut?.id, 'p1');
    assert.deepEqual(teamA.map(p => p.id).sort(), ['p2', 'p5']);
    assert.deepEqual(teamB.map(p => p.id).sort(), ['p3', 'p4']);
  });

  it('deterministic: cùng input → cùng output', () => {
    const a = pairPlayers(mk(6));
    const b = pairPlayers(mk(6));
    assert.deepEqual(a.teamA.map(p => p.id), b.teamA.map(p => p.id));
    assert.deepEqual(a.teamB.map(p => p.id), b.teamB.map(p => p.id));
  });

  it('property test 100k lần: invariants luôn đúng (N=2..12)', () => {
    const iterations = 100_000;
    for (let i = 0; i < iterations; i++) {
      const n = 4 + (i % 9);
      const { teamA, teamB, sittingOut } = pairPlayers(mk(n));
      const total = teamA.length + teamB.length + (sittingOut ? 1 : 0);
      assert.equal(total, n);
      const ids = new Set([...teamA, ...teamB, ...(sittingOut ? [sittingOut] : [])].map(p => p.id));
      assert.equal(ids.size, n);
      if (n % 2 === 0) {
        assert.equal(sittingOut, null);
        assert.equal(teamA.length + teamB.length, n);
        assert.ok(teamA.some(p => p.id === 'p1'));
        assert.ok(teamA.some(p => p.id === `p${n}`));
        assert.ok(teamB.some(p => p.id === 'p2'));
        assert.ok(teamB.some(p => p.id === `p${n - 1}`));
      } else {
        assert.ok(sittingOut);
        assert.equal(teamA.length + teamB.length, n - 1);
      }
    }
  });

  it('N<2 ném lỗi', () => {
    assert.throws(() => pairPlayers(mk(1)));
    assert.throws(() => pairPlayers([]));
  });
});