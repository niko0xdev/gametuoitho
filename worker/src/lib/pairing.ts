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
// Cặp giữa (n/2, n/2+1) random team để tránh deterministic unfair.
function pairEven<P extends Player>(ranked: readonly P[], rng: Rng): PairResult<P> {
  const n = ranked.length;
  const teamA: P[] = [];
  const teamB: P[] = [];
  const half = Math.floor(n / 2);
  for (let i = 0; i < half; i++) {
    const lo = ranked[i];
    const hi = ranked[n - 1 - i];
    // Cặp ngoài cùng tuân theo alternating strict: i chẵn → A, i lẻ → B.
    // Cặp giữa (i = half - 1): random, NHƯNG nếu chỉ có 2 cặp (N=4) thì phải đi
    // ngược cặp ngoài để đảm bảo mỗi team có ít nhất 1 người.
    const isMiddle = i === half - 1;
    let goToA: boolean;
    if (isMiddle && half === 2) {
      // N=4: 2 cặp. Ép cặp giữa đi team ngược lại cặp ngoài.
      // Cặp ngoài i=0: i%2===0 → A. Vậy cặp giữa i=1 phải đi B.
      goToA = false;
    } else if (isMiddle) {
      goToA = rng() < 0.5;
    } else {
      goToA = i % 2 === 0;
    }
    if (goToA) {
      teamA.push(lo, hi);
    } else {
      teamB.push(lo, hi);
    }
  }
  return { teamA, teamB, sittingOut: null };
}