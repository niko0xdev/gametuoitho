export interface Player {
  id: string;
}

export interface PairResult<P extends Player> {
  teamA: P[];
  teamB: P[];
  sittingOut: P | null;
}

export type Rng = () => number;

export interface PairingHistory {
  timestamp: number;
  team1: string[];
  team2: string[];
}

const defaultRng: Rng = Math.random;

// Shuffle without skill weighting; four players cannot repeat their latest pairing.
export function pairPlayers<P extends Player>(
  players: readonly P[],
  rng: Rng = defaultRng,
  history: readonly PairingHistory[] = []
): PairResult<P> {
  const n = players.length;
  if (n < 2) {
    throw new Error('Cần ít nhất 2 người chơi để ghép trận');
  }

  const shuffled = [...players];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Lẻ người → 1 người nghỉ (dự bị) trận này, giữ hành vi cũ.
  let sittingOut: P | null = null;
  if (shuffled.length % 2 === 1) {
    sittingOut = shuffled.pop()!;
  }

  const teamA: P[] = [];
  const teamB: P[] = [];
  shuffled.forEach((p, i) => (i % 2 === 0 ? teamA.push(p) : teamB.push(p)));

  if (n === 4) {
    const rosterKey = (ids: string[]) => JSON.stringify([...ids].sort());
    const selectedKey = rosterKey(players.map(p => p.id));
    const previous = history
      .filter(m => m.team1.length === 2 && m.team2.length === 2
        && rosterKey([...m.team1, ...m.team2]) === selectedKey)
      .reduce<PairingHistory | undefined>((latest, m) =>
        !latest || m.timestamp > latest.timestamp ? m : latest, undefined);
    if (previous) {
      const teamKey = rosterKey(teamA.map(p => p.id));
      if (teamKey === rosterKey(previous.team1) || teamKey === rosterKey(previous.team2)) {
        // Either swap produces one of the two remaining partitions, with equal odds.
        const swapIndex = Math.floor(rng() * 2);
        [teamA[1], teamB[swapIndex]] = [teamB[swapIndex], teamA[1]];
      }
    }
  }

  return { teamA, teamB, sittingOut };
}
