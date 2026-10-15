import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { pairPlayers, type Player } from '../src/lib/pairing';

const mk = (n: number): Player[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` }));

const ids = (arr: Player[]): string[] => arr.map(p => p.id);

describe('pairPlayers (random thuần)', () => {
  it('even N=8: chia đều 4-4, không mất người, không trùng id', () => {
    const { teamA, teamB, sittingOut } = pairPlayers(mk(8), () => 0.5);
    assert.equal(sittingOut, null);
    assert.equal(teamA.length, 4);
    assert.equal(teamB.length, 4);
    const allIds = new Set([...ids(teamA), ...ids(teamB)]);
    assert.equal(allIds.size, 8);
  });

  it('odd N=5: sittingOut 1 người, teams 2-2', () => {
    const { teamA, teamB, sittingOut } = pairPlayers(mk(5), () => 0.5);
    assert.ok(sittingOut);
    assert.equal(teamA.length, 2);
    assert.equal(teamB.length, 2);
    const total = teamA.length + teamB.length + 1;
    assert.equal(total, 5);
  });

  it('deterministic với cùng rng: cùng input → cùng output', () => {
    const a = pairPlayers(mk(8), () => 0.123);
    const b = pairPlayers(mk(8), () => 0.123);
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
      const n = 4 + (i % 9); // 4..12
      const players = mk(n);
      const rng = () => Math.random();
      const { teamA, teamB, sittingOut } = pairPlayers(players, rng);
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

describe('four-player previous-match exclusion', () => {
  const key = (teams: string[][]) => JSON.stringify(teams.map(t => [...t].sort()).sort());
  it('excludes the latest matching roster even when colours are reversed', () => {
    const history = [
      { timestamp: 10, team1: ['p1', 'p3'], team2: ['p2', 'p4'] },
      { timestamp: 20, team1: ['p4', 'p2'], team2: ['p3', 'p1'] },
      { timestamp: 30, team1: ['p1', 'p2'], team2: ['p3', 'other'] },
    ];
    for (const rng of [() => 0, () => 0.99, () => 0.5]) {
      const result = pairPlayers(mk(4), rng, history);
      assert.notEqual(key([ids(result.teamA), ids(result.teamB)]), key([history[1].team1, history[1].team2]));
      assert.deepEqual([...ids(result.teamA), ...ids(result.teamB)].sort(), ids(mk(4)));
    }
  });
  it('leaves other roster sizes and unrelated history unchanged', () => {
    const history = [{ timestamp: 1, team1: ['x', 'y'], team2: ['z', 'w'] }];
    for (const n of [2, 4, 5, 8]) {
      assert.deepEqual(pairPlayers(mk(n), () => 0.5, history), pairPlayers(mk(n), () => 0.5));
    }
  });
});

describe('previous-match exclusion for every roster size', () => {
  const key = (r: ReturnType<typeof pairPlayers>) => JSON.stringify({
    teams: [ids(r.teamA).sort(), ids(r.teamB).sort()].sort(),
    benched: r.sittingOut?.id ?? null,
  });
  it('avoids repeats for 3–12 players, including unchanged random sources', () => {
    for (let n = 3; n <= 12; n++) {
      for (const value of [0, 0.5, 0.99]) {
        const players = mk(n);
        const previous = pairPlayers(players, () => value);
        const history = [{
          timestamp: 1, team1: ids(previous.teamB), team2: ids(previous.teamA),
          benched: previous.sittingOut?.id,
        }];
        const next = pairPlayers(players, () => value, history);
        assert.notEqual(key(next), key(previous), 'n=' + n);
        assert.equal(next.teamA.length, Math.floor(n / 2));
        assert.equal(next.teamB.length, Math.floor(n / 2));
        assert.deepEqual([...ids(next.teamA), ...ids(next.teamB),
          ...(next.sittingOut ? [next.sittingOut.id] : [])].sort(), ids(players).sort());
      }
    }
  });
  it('keeps the only possible 1v1 pairing for two players', () => {
    const players = mk(2);
    assert.deepEqual(pairPlayers(players, () => 0.5, [
      { timestamp: 1, team1: ['p1'], team2: ['p2'] },
    ]), pairPlayers(players, () => 0.5));
  });
});

describe('reserve rotation', () => {
  it('always fields the previous reserve, even when the rest of the roster changes', () => {
    for (const n of [3, 5, 7, 9]) {
      const players = mk(n);
      const first = pairPlayers(players, () => 0.99);
      const history = [{
        timestamp: 2, team1: ids(first.teamA), team2: ids(first.teamB),
        benched: first.sittingOut!.id,
      }];
      // This RNG would pick the same reserve but change the team partition.
      const values = [0.99, 0, 0.99, 0.5, 0.99];
      let i = 0;
      const next = pairPlayers(players, () => values[i++ % values.length], history);
      assert.notEqual(next.sittingOut?.id, first.sittingOut!.id);
      assert.ok([...ids(next.teamA), ...ids(next.teamB)].includes(first.sittingOut!.id));
      const changed = players.map((p, index) => index === 0 ? { id: 'new' } : p);
      const afterChange = pairPlayers(changed, () => 0.99, history);
      assert.notEqual(afterChange.sittingOut?.id, first.sittingOut!.id);
    }
  });
  it('uses the immediately preceding match rather than an older roster match for reserve rotation', () => {
    const history = [
      { timestamp: 1, team1: ['p1', 'p2'], team2: ['p3', 'p4'], benched: 'p5' },
      { timestamp: 2, team1: ['p1', 'other'], team2: ['p4', 'p5'], benched: 'p3' },
    ];
    const result = pairPlayers(mk(5), () => 0.5, history);
    assert.notEqual(result.sittingOut?.id, 'p3');
  });
});
