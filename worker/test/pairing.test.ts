import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { pairPlayers, type Player } from '../src/lib/pairing';

const mk = (n: number): Player[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` }));

describe('pairPlayers', () => {
  it('even N=8: rank1 & rankN cùng Team A; rank2 & rankN-1 cùng Team B (rng=0.99 → middle goes B)', () => {
    const { teamA, teamB, sittingOut } = pairPlayers(mk(8), () => 0.99);
    assert.equal(sittingOut, null);
    assert.equal(teamA.length, 4);
    assert.equal(teamB.length, 4);
    assert.ok(teamA.some(p => p.id === 'p1'));
    assert.ok(teamA.some(p => p.id === 'p8'));
    assert.ok(teamB.some(p => p.id === 'p2'));
    assert.ok(teamB.some(p => p.id === 'p7'));
  });

  it('even N=8: half=4 chẵn → full alternating, không cần split, A={1,3,6,8} B={2,4,5,7}', () => {
    const { teamA, teamB } = pairPlayers(mk(8), () => 0);
    assert.equal(teamA.length, 4);
    assert.equal(teamB.length, 4);
    assert.deepEqual(teamA.map(p => p.id).sort(), ['p1', 'p3', 'p6', 'p8']);
    assert.deepEqual(teamB.map(p => p.id).sort(), ['p2', 'p4', 'p5', 'p7']);
  });

  it('even N=6: cặp ngoài (1,6)→A, (2,5)→B; cặp giữa (3,4) split 1-1 → mỗi team 3 người', () => {
    const a = pairPlayers(mk(6), () => 0);
    assert.equal(a.teamA.length, 3);
    assert.equal(a.teamB.length, 3);
    assert.deepEqual(a.teamA.map(p => p.id).sort(), ['p1', 'p3', 'p6']);
    assert.deepEqual(a.teamB.map(p => p.id).sort(), ['p2', 'p4', 'p5']);
    const b = pairPlayers(mk(6), () => 0.99);
    assert.equal(b.teamA.length, 3);
    assert.equal(b.teamB.length, 3);
    assert.deepEqual(b.teamA.map(p => p.id).sort(), ['p1', 'p4', 'p6']);
    assert.deepEqual(b.teamB.map(p => p.id).sort(), ['p2', 'p3', 'p5']);
  });

  it('even N=4: 2 cặp → (1,4)→A (2,3)→B deterministic', () => {
    const result = pairPlayers(mk(4));
    assert.deepEqual(result.teamA.map(p => p.id).sort(), ['p1', 'p4']);
    assert.deepEqual(result.teamB.map(p => p.id).sort(), ['p2', 'p3']);
  });

  it('even N=10: half=5 lẻ → split middle (5,6), teams luôn 5-5', () => {
    const a = pairPlayers(mk(10), () => 0);
    assert.equal(a.teamA.length, 5);
    assert.equal(a.teamB.length, 5);
    const b = pairPlayers(mk(10), () => 0.99);
    assert.equal(b.teamA.length, 5);
    assert.equal(b.teamB.length, 5);
  });

  it('even N=12: half=6 chẵn → full alternating, teams luôn 6-6', () => {
    const { teamA, teamB } = pairPlayers(mk(12), () => 0);
    assert.equal(teamA.length, 6);
    assert.equal(teamB.length, 6);
  });

  it('odd N=5 (rng=0): sittingOut=p1, teams chia đều', () => {
    const { teamA, teamB, sittingOut } = pairPlayers(mk(5), () => 0);
    assert.ok(sittingOut);
    assert.equal(sittingOut.id, 'p1');
    assert.equal(teamA.length, 2);
    assert.equal(teamB.length, 2);
  });

  it('odd N=5: sau khi loại p1, ghép (1,5)→A (2,4)→B', () => {
    const { teamA, teamB, sittingOut } = pairPlayers(mk(5), () => 0);
    assert.equal(sittingOut?.id, 'p1');
    assert.deepEqual([...teamA].map(p => p.id).sort(), ['p2', 'p5']);
    assert.deepEqual([...teamB].map(p => p.id).sort(), ['p3', 'p4']);
  });

  it('property test 100k lần: invariants luôn đúng (N=4..12), teams luôn chia đều N/2', () => {
    const iterations = 100_000;
    for (let i = 0; i < iterations; i++) {
      const n = 4 + (i % 9); // 4..12
      const players = mk(n);
      const rng = () => (i % 2 === 0 ? 0 : 0.99); // đảo 2 nhánh split-middle
      const { teamA, teamB, sittingOut } = pairPlayers(players, rng);

      const totalSeated = teamA.length + teamB.length + (sittingOut ? 1 : 0);
      assert.equal(totalSeated, n, `iter ${i}: thiếu/thừa người`);

      const ids = new Set([...teamA, ...teamB, ...(sittingOut ? [sittingOut] : [])].map(p => p.id));
      assert.equal(ids.size, n, `iter ${i}: trùng id`);

      if (n % 2 === 0) {
        assert.equal(sittingOut, null);
        assert.equal(teamA.length, n / 2, `iter ${i}, n=${n}: teamA không đúng N/2`);
        assert.equal(teamB.length, n / 2, `iter ${i}, n=${n}: teamB không đúng N/2`);
        assert.ok(teamA.some(p => p.id === 'p1'));
        assert.ok(teamA.some(p => p.id === `p${n}`));
        assert.ok(teamB.some(p => p.id === 'p2'));
        assert.ok(teamB.some(p => p.id === `p${n - 1}`));
      } else {
        assert.ok(sittingOut);
        assert.equal(teamA.length + teamB.length, n - 1);
        assert.equal(Math.abs(teamA.length - teamB.length), 0, `iter ${i}, n=${n}: lệch team`);
      }
    }
  });

  it('N<2 ném lỗi', () => {
    assert.throws(() => pairPlayers(mk(1)));
    assert.throws(() => pairPlayers([]));
  });

  it('rng tùy biến: rng luôn 0 → sittingOut = phần tử đầu', () => {
    const { sittingOut } = pairPlayers(mk(5), () => 0);
    assert.equal(sittingOut?.id, 'p1');
  });
});