// Per-isolate, in-memory map of SSE controllers keyed by userId.
// Multi-tab support: Set of controllers per user.
type Controller = {
  send: (event: string, data: unknown) => void;
  close: () => void;
};

const matchmaking = new Map<string, Set<Controller>>();
const matchStreams = new Map<string, Set<Controller>>(); // matchId

export function addMatchmaking(userId: string, ctrl: Controller): () => void {
  let set = matchmaking.get(userId);
  if (!set) {
    set = new Set();
    matchmaking.set(userId, set);
  }
  set.add(ctrl);
  return () => {
    const s = matchmaking.get(userId);
    if (!s) return;
    s.delete(ctrl);
    if (s.size === 0) matchmaking.delete(userId);
  };
}

export function getMatchmakingUsers(): string[] {
  return [...matchmaking.keys()];
}

export function sendToMatchmaking(userId: string, event: string, data: unknown): void {
  const set = matchmaking.get(userId);
  if (!set) return;
  for (const ctrl of set) {
    ctrl.send(event, data);
    ctrl.close();
  }
  matchmaking.delete(userId);
}

export function addMatchStream(matchId: string, ctrl: Controller): () => void {
  let set = matchStreams.get(matchId);
  if (!set) {
    set = new Set();
    matchStreams.set(matchId, set);
  }
  set.add(ctrl);
  return () => {
    const s = matchStreams.get(matchId);
    if (!s) return;
    s.delete(ctrl);
    if (s.size === 0) matchStreams.delete(matchId);
  };
}

export function broadcastMatch(matchId: string, event: string, data: unknown): void {
  const set = matchStreams.get(matchId);
  if (!set) return;
  for (const ctrl of set) ctrl.send(event, data);
}
