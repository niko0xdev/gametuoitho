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

export function useMatchStream(matchId: string | null) {
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const lastTsRef = useRef<number>(0);
  const reconnectAttemptsRef = useRef(0);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    let es: EventSource | null = null;

    const connect = () => {
      if (cancelled) return;
      const url = `${import.meta.env.VITE_API_BASE}/api/match/${matchId}/stream`;
      es = new EventSource(url);

      es.addEventListener('snapshot', (e) => {
        const data: MatchSnapshot = JSON.parse((e as MessageEvent).data);
        lastTsRef.current = data.moves.length ? data.moves[data.moves.length - 1].ts : 0;
        if (cancelled) return;
        setSnapshot(data);
      });

      es.addEventListener('move', (e) => {
        const data: MatchMove & { turn: string } = JSON.parse((e as MessageEvent).data);
        // Dedup: ignore moves we already applied optimistically
        if (data.ts <= lastTsRef.current) return;
        lastTsRef.current = data.ts;
        if (cancelled) return;
        setSnapshot((prev) =>
          prev
            ? { ...prev, moves: [...prev.moves, { userId: data.userId, move: data.move, ts: data.ts }], turn: data.turn }
            : prev
        );
      });

      es.addEventListener('ended', (e) => {
        const data: { winner: string | null; reason: string } = JSON.parse((e as MessageEvent).data);
        if (cancelled) return;
        setSnapshot((prev) => (prev ? { ...prev, status: 'ENDED', winner: data.winner } : prev));
      });

      es.addEventListener('open', () => {
        reconnectAttemptsRef.current = 0;
      });

      es.onerror = () => {
        es?.close();
        if (cancelled) return;
        if (reconnectAttemptsRef.current >= MAX_RECONNECTS) return;
        reconnectAttemptsRef.current++;
        const delay = 500 * Math.pow(2, reconnectAttemptsRef.current - 1);
        setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      cancelled = true;
      es?.close();
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
      // Simpler than rollback math — one extra D1 read is cheap.
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