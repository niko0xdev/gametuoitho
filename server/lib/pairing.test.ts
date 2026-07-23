import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pairPlayers, type Player } from './pairing.ts';

const mk = (n: number): Player[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` }));

describe('pairPlayers', () => {
  it('even N=8: rank1 & rankN luôn cùng Team A; rank2 & rankN-1 cùng Team B (rng=0.99 → middle goes B)', () => {
    const { teamA, teamB, sittingOut } = pairPlayers(mk(8), () => 0.99);
    assert.equal(sittingOut, null);
    assert.equal(teamA.length, 4);
    assert.equal(teamB.length, 4);
    assert.ok(teamA.some(p => p.id === 'p1'));
    assert.ok(teamA.some(p => p.id === 'p8'));
    assert.ok(teamB.some(p => p.id === 'p2'));
    assert.ok(teamB.some(p => p.id === 'p7'));
  });

  it('even N=8 với rng=0 → middle (4,5)→A: A={1,3,4,5,6,8} B={2,7}', () => {
    const { teamA, teamB } = pairPlayers(mk(8), () => 0);
    assert.deepEqual(teamA.map(p => p.id).sort(), ['p1', 'p3', 'p4', 'p5', 'p6', 'p8']);
    assert.deepEqual(teamB.map(p => p.id).sort(), ['p2', 'p7']);
  });

  it('even N=6: cặp ngoài (1,6)→A, (2,5)→B; cặp giữa (3,4) random', () => {
    // rng=0 → middle goes B → A={1,6,3,4}={1,3,4,6}, B={2,5}
    const a = pairPlayers(mk(6), () => 0);
    assert.deepEqual(a.teamA.map(p => p.id).sort(), ['p1', 'p3', 'p4', 'p6']);
    assert.deepEqual(a.teamB.map(p => p.id).sort(), ['p2', 'p5']);
    // rng=0.99 → middle goes B → A={1,6}, B={2,3,4,5}
    const b = pairPlayers(mk(6), () => 0.99);
    assert.deepEqual(b.teamA.map(p => p.id).sort(), ['p1', 'p6']);
    assert.deepEqual(b.teamB.map(p => p.id).sort(), ['p2', 'p3', 'p4', 'p5']);
  });

  it('even N=4: 2 cặp → (1,4)→A (2,3)→B deterministic', () => {
    const result = pairPlayers(mk(4));
    assert.deepEqual(result.teamA.map(p => p.id).sort(), ['p1', 'p4']);
    assert.deepEqual(result.teamB.map(p => p.id).sort(), ['p2', 'p3']);
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

  it('deterministic với cùng rng: cùng input → cùng output', () => {
    const a = pairPlayers(mk(6), () => 0.3);
    const b = pairPlayers(mk(6), () => 0.3);
    assert.deepEqual(a.teamA.map(p => p.id), b.teamA.map(p => p.id));
    assert.deepEqual(a.teamB.map(p => p.id), b.teamB.map(p => p.id));
  });

  it('property test 100k lần: invariants luôn đúng (N=4..12)', () => {
    const iterations = 100_000;
    for (let i = 0; i < iterations; i++) {
      const n = 4 + (i % 9);
      const { teamA, teamB, sittingOut } = pairPlayers(mk(n), () => 0.3);
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