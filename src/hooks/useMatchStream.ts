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

export function useMatchStream(matchId: string | null) {
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const lastTsRef = useRef<number>(0);

  useEffect(() => {
    if (!matchId) return;
    const url = `${import.meta.env.VITE_API_BASE}/api/match/${matchId}/stream`;
    const es = new EventSource(url);

    es.addEventListener('snapshot', (e) => {
      const data: MatchSnapshot = JSON.parse((e as MessageEvent).data);
      lastTsRef.current = data.moves.length ? data.moves[data.moves.length - 1].ts : 0;
      setSnapshot(data);
    });

    es.addEventListener('move', (e) => {
      const data: MatchMove & { turn: string } = JSON.parse((e as MessageEvent).data);
      lastTsRef.current = data.ts;
      setSnapshot((prev) =>
        prev
          ? { ...prev, moves: [...prev.moves, { userId: data.userId, move: data.move, ts: data.ts }], turn: data.turn }
          : prev
      );
    });

    es.addEventListener('ended', (e) => {
      const data: { winner: string | null; reason: string } = JSON.parse((e as MessageEvent).data);
      setSnapshot((prev) => (prev ? { ...prev, status: 'ENDED', winner: data.winner } : prev));
    });

    es.onerror = () => es.close();
    return () => es.close();
  }, [matchId]);

  const sendMove = async (move: unknown) => {
    if (!matchId) return;
    const userId = localStorage.getItem('auth_userId');
    // Optimistic update
    const ts = Date.now();
    setSnapshot((prev) =>
      prev ? { ...prev, moves: [...prev.moves, { userId: userId!, move, ts }] } : prev
    );
    try {
      await api(`/api/match/${matchId}/move`, {
        method: 'POST',
        body: JSON.stringify({ userId, move }),
      });
    } catch {
      // Revert by reconnecting; for simplicity, leave optimistic and let SSE reconcile.
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