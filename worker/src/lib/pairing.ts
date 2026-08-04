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

// Random thuần: xáo trộn Fisher-Yates đều rồi chia xen kẽ — KHÔNG đọc
// ELO / bảng xếp hạng tuần, không cân bằng trình độ. Thứ tự input bị bỏ qua.
export function pairPlayers<P extends Player>(
  players: readonly P[],
  rng: Rng = defaultRng
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

  return { teamA, teamB, sittingOut };
}
