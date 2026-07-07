import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

export type MatchMove = { userId: string; move: unknown; ts: number };

export type MatchSnapshot = {
  matchId: string;
  status: 'PLAYING' | 'ENDED' | 'WAITING';
  players: string[];
  turn: string;
  moves: MatchMove[];
  winner?: string | null;
};

const MAX_RECONNECTS = 5;

// Derive ws:// or wss:// from the API base (http:// → ws://, https:// → wss://).
const wsBase = (import.meta.env.VITE_API_BASE as string).replace(/^http/, 'ws');

export function useMatchStream(matchId: string | null) {
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const lastTsRef = useRef<number>(0);
  const reconnectAttemptsRef = useRef<number>(0);

  useEffect(() => {
    if (!matchId) return;
    const userId = localStorage.getItem('auth_userId');
    if (!userId) return;

    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      if (cancelled) return;
      ws = new WebSocket(`${wsBase}/api/match/${matchId}/ws?userId=${encodeURIComponent(userId)}`);

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (cancelled) return;
        if (data.event === 'snapshot') {
          lastTsRef.current = data.moves.length ? data.moves[data.moves.length - 1].ts : 0;
          setSnapshot({
            matchId: data.matchId,
            status: data.status,
            players: data.players,
            turn: data.turn,
            moves: data.moves,
            winner: data.winner,
          });
        } else if (data.event === 'move') {
          // Dedup: ignore moves we already applied optimistically.
          if (data.ts <= lastTsRef.current) return;
          lastTsRef.current = data.ts;
          setSnapshot((prev) =>
            prev
              ? { ...prev, moves: [...prev.moves, { userId: data.userId, move: data.move, ts: data.ts }], turn: data.turn }
              : prev
          );
        } else if (data.event === 'ended') {
          setSnapshot((prev) => (prev ? { ...prev, status: 'ENDED', winner: data.winner } : prev));
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        if (reconnectAttemptsRef.current >= MAX_RECONNECTS) return;
        reconnectAttemptsRef.current++;
        const delay = 500 * Math.pow(2, reconnectAttemptsRef.current - 1);
        reconnectTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();
    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [matchId]);

  const sendMove = async (move: unknown) => {
    if (!matchId) return;
    const userId = localStorage.getItem('auth_userId');
    const ts = Date.now();
    // Optimistic update with the local timestamp
    lastTsRef.current = ts;
    setSnapshot((prev) =>
      prev ? { ...prev, moves: [...prev.moves, { userId: userId!, move, ts }] } : prev
    );
    try {
      await api(`/api/match/${matchId}/move`, {
        method: 'POST',
        body: JSON.stringify({ userId, move }),
      });
    } catch {
      // On failure: reload snapshot to reconcile (drop our optimistic entry).
      try {
        const fresh = await api<MatchSnapshot>(`/api/match/${matchId}/state`);
        lastTsRef.current = fresh.moves.length ? fresh.moves[fresh.moves.length - 1].ts : 0;
        setSnapshot(fresh);
      } catch {
        // give up; user can refresh page
      }
    }
  };

  const forfeit = async () => {
    if (!matchId) return;
    const userId = localStorage.getItem('auth_userId');
    await api(`/api/match/${matchId}/forfeit`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  };

  return { snapshot, sendMove, forfeit };
}
