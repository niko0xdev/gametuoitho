export interface Player {
  id: string;
}

export interface PairResult<P extends Player> {
  teamA: P[];
  teamB: P[];
  sittingOut: P | null;
}

export type Rng = () => number;

const defaultRng: Rng = Math.random;

export function pairPlayers<P extends Player>(
  ranked: readonly P[],
  rng: Rng = defaultRng
): PairResult<P> {
  const n = ranked.length;
  if (n < 2) {
    throw new Error('Cần ít nhất 2 người chơi để ghép trận');
  }

  if (n % 2 === 1) {
    const idx = Math.floor(rng() * n);
    const sittingOut = ranked[idx];
    const remaining: P[] = [];
    for (let i = 0; i < n; i++) {
      if (i !== idx) remaining.push(ranked[i]);
    }
    return { ...pairEven(remaining, rng), sittingOut };
  }

  return pairEven(ranked, rng);
}

// Pair cặp ngoài cùng (1,N)→A, (2,N-1)→B, (3,N-2)→A, ...
// half chẵn: push nguyên hết, alternating tự cân bằng N/2 mỗi team.
// half lẻ: alternating hết trừ cặp giữa, cặp giữa split 1-1 random để bù lệch.
function pairEven<P extends Player>(ranked: readonly P[], rng: Rng): PairResult<P> {
  const n = ranked.length;
  const teamA: P[] = [];
  const teamB: P[] = [];
  const half = Math.floor(n / 2);
  const splitMiddle = half % 2 === 1;
  for (let i = 0; i < half; i++) {
    const lo = ranked[i];
    const hi = ranked[n - 1 - i];
    if (splitMiddle && i === half - 1) {
      if (rng() < 0.5) {
        teamA.push(lo);
        teamB.push(hi);
      } else {
        teamA.push(hi);
        teamB.push(lo);
      }
    } else if (i % 2 === 0) {
      teamA.push(lo, hi);
    } else {
      teamB.push(lo, hi);
    }
  }
  return { teamA, teamB, sittingOut: null };
}