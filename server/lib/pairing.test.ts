import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pairPlayers, type Player } from './pairing.ts';

const mk = (n: number): Player[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` }));

const ids = (players: Player[]) => players.map(p => p.id);

describe('pairPlayers (random thuần)', () => {
  it('even N=8: chia đều 4-4, không mất người', () => {
    const { teamA, teamB, sittingOut } = pairPlayers(mk(8));
    assert.equal(sittingOut, null);
    assert.equal(teamA.length, 4);
    assert.equal(teamB.length, 4);
  });

  it('even N=4: 2-2, giữ nguyên toàn bộ id', () => {
    const { teamA, teamB, sittingOut } = pairPlayers(mk(4));
    assert.equal(sittingOut, null);
    assert.deepEqual([...ids(teamA), ...ids(teamB)].sort(), ['p1', 'p2', 'p3', 'p4']);
  });

  it('odd N=5: sittingOut 1 người, teams 2-2', () => {
    const { teamA, teamB, sittingOut } = pairPlayers(mk(5));
    assert.ok(sittingOut);
    assert.equal(teamA.length, 2);
    assert.equal(teamB.length, 2);
    assert.equal(ids(teamA).length + ids(teamB).length + 1, 5);
  });

  it('deterministic với cùng rng: cùng input → cùng output', () => {
    const a = pairPlayers(mk(6), () => 0.3);
    const b = pairPlayers(mk(6), () => 0.3);
    assert.deepEqual(ids(a.teamA), ids(b.teamA));
    assert.deepEqual(ids(a.teamB), ids(b.teamB));
  });

  it('deterministic với rng cố định: rng=0 → [p2,p3,p4,p5,p1]; rng=0.99 → giữ nguyên thứ tự', () => {
    // rng()=0: j luôn 0 → Fisher-Yates thành [p2,p3,p4,p5,p1], pop p1 ra bench
    const a = pairPlayers(mk(5), () => 0);
    assert.deepEqual(ids(a.teamA), ['p2', 'p4']);
    assert.deepEqual(ids(a.teamB), ['p3', 'p5']);
    assert.equal(a.sittingOut?.id, 'p1');
    // rng()=0.99: j=floor(0.99*(i+1))=i → không swap, pop p5 ra bench
    const b = pairPlayers(mk(5), () => 0.99);
    assert.deepEqual(ids(b.teamA), ['p1', 'p3']);
    assert.deepEqual(ids(b.teamB), ['p2', 'p4']);
    assert.equal(b.sittingOut?.id, 'p5');
  });

  it('property test 100k lần: invariants luôn đúng (N=4..12) — Fisher-Yates chia đều, không mất người', () => {
    const iterations = 100_000;
    for (let i = 0; i < iterations; i++) {
      const n = 4 + (i % 9);
      const rng = () => (i % 2 === 0 ? 0 : 0.99);
      const { teamA, teamB, sittingOut } = pairPlayers(mk(n), rng);
      const total = teamA.length + teamB.length + (sittingOut ? 1 : 0);
      assert.equal(total, n);
      const allIds = new Set([...ids(teamA), ...ids(teamB), ...(sittingOut ? ids([sittingOut]) : [])]);
      assert.equal(allIds.size, n);
      if (n % 2 === 0) {
        assert.equal(sittingOut, null);
        assert.equal(teamA.length, n / 2, `n=${n}: teamA không đúng N/2`);
        assert.equal(teamB.length, n / 2, `n=${n}: teamB không đúng N/2`);
      } else {
        assert.ok(sittingOut);
        assert.equal(Math.abs(teamA.length - teamB.length), 0, `n=${n}: lệch team`);
      }
    }
  });

  it('N<2 ném lỗi', () => {
    assert.throws(() => pairPlayers(mk(1)));
    assert.throws(() => pairPlayers([]));
  });
});
