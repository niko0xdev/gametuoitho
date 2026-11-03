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
  benched?: string | null;
}

const defaultRng: Rng = Math.random;

// Shuffle without skill weighting; avoid the latest pairing for the same roster.
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

  if (n > 2) {
    const rosterKey = (ids: string[]) => JSON.stringify([...ids].sort());
    const selectedKey = rosterKey(players.map(p => p.id));
    const previous = history
      .filter(m => m.team1.length === Math.floor(n / 2) && m.team2.length === Math.floor(n / 2)
        && rosterKey([...m.team1, ...m.team2, ...(m.benched ? [m.benched] : [])]) === selectedKey)
      .reduce<PairingHistory | undefined>((latest, m) =>
        !latest || m.timestamp > latest.timestamp ? m : latest, undefined);
    const latestMatch = history.reduce<PairingHistory | undefined>((latest, m) =>
      !latest || m.timestamp > latest.timestamp ? m : latest, undefined);
    const protectedReserve = n % 2 === 1 ? latestMatch?.benched : null;
    if (previous || protectedReserve) {
      const repeats = (result: PairResult<P>) => {
        if (protectedReserve && result.sittingOut?.id === protectedReserve) return true;
        if (!previous) return false;
        const teamKey = rosterKey(result.teamA.map(p => p.id));
        return (result.sittingOut?.id ?? null) === (previous.benched ?? null)
          && (teamKey === rosterKey(previous.team1) || teamKey === rosterKey(previous.team2));
      };
      let result = { teamA, teamB, sittingOut };
      // Rejection sampling preserves equal odds among the remaining partitions.
      for (let attempt = 0; repeats(result) && attempt < 16; attempt++) {
        result = pairPlayers(players, rng);
      }
      if (repeats(result)) {
        // Bound retries even for a stuck RNG. For 3 players, swap the reserve;
        // swapping the two solo teams would only reverse their colours.
        if (result.sittingOut) {
          const replacement = [...result.teamA, ...result.teamB].find(p =>
            p.id !== protectedReserve && p.id !== previous?.benched)!;
          const team = result.teamA.includes(replacement) ? result.teamA : result.teamB;
          const index = team.indexOf(replacement);
          [team[index], result.sittingOut] = [result.sittingOut, team[index]];
        } else {
          [result.teamA[0], result.teamB[0]] = [result.teamB[0], result.teamA[0]];
        }
      }
      return result;
    }
  }

  return { teamA, teamB, sittingOut };
}

export function pairFourPlayers<P extends Player>(
  players: readonly P[], rng: Rng = defaultRng, history: readonly PairingHistory[] = []
): { teamA: P[]; teamB: P[]; sittingOut: P[] } {
  if (players.length < 4) throw new Error('Chọn ít nhất 4 người cho chế độ Hết giờ.');
  const shuffled = [...players];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const paired = pairPlayers(shuffled.slice(0, 4), rng, history);
  return { teamA: paired.teamA, teamB: paired.teamB, sittingOut: shuffled.slice(4) };
}
