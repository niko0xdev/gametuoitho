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
    return { ...pairEven(remaining), sittingOut };
  }

  return pairEven(ranked);
}

// Sort by rank (rank 1 = ranked[0], rank N = ranked[n-1]).
// Cặp (1,N), (2,N-1), (3,N-2)... cặp 0,2,4...→A; cặp 1,3,5...→B
function pairEven<P extends Player>(ranked: readonly P[]): PairResult<P> {
  const n = ranked.length;
  const teamA: P[] = [];
  const teamB: P[] = [];
  for (let i = 0; i < n / 2; i++) {
    const lo = ranked[i];
    const hi = ranked[n - 1 - i];
    if (i % 2 === 0) {
      teamA.push(lo, hi);
    } else {
      teamB.push(lo, hi);
    }
  }
  return { teamA, teamB, sittingOut: null };
}