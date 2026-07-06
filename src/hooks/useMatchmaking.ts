import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export type MatchmakingState = {
  status: 'IDLE' | 'WAITING' | 'MATCHED';
  matchId?: string;
  opponentId?: string;
  error?: string;
};

export function useMatchmaking(gameId: string | null): MatchmakingState & {
  start: () => void;
  cancel: () => void;
} {
  const [state, setState] = useState<MatchmakingState>({ status: 'IDLE' });

  useEffect(() => {
    if (!gameId || state.status !== 'WAITING') return;
    const userId = localStorage.getItem('userId');
    if (!userId) {
      setState({ status: 'IDLE', error: 'Not logged in' });
      return;
    }
    const url = `${import.meta.env.VITE_API_BASE}/api/matchmaking/stream?userId=${encodeURIComponent(userId)}&gameId=${encodeURIComponent(gameId)}`;
    const es = new EventSource(url);
    es.addEventListener('matched', (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      setState({ status: 'MATCHED', matchId: data.matchId, opponentId: data.opponentId });
      es.close();
    });
    es.onerror = () => {
      setState({ status: 'IDLE', error: 'Stream error' });
      es.close();
    };
    return () => es.close();
  }, [gameId, state.status]);

  const start = async () => {
    if (!gameId) return;
    setState({ status: 'WAITING' });
    const userId = localStorage.getItem('userId');
    try {
      const res = await api<{ matched: boolean; matchId?: string; opponentId?: string }>('/api/matchmaking/join', {
        method: 'POST',
        body: JSON.stringify({ userId, gameId }),
      });
      if (res.matched) {
        setState({ status: 'MATCHED', matchId: res.matchId, opponentId: res.opponentId });
      }
    } catch (e: any) {
      setState({ status: 'IDLE', error: e.message });
    }
  };

  const cancel = async () => {
    const userId = localStorage.getItem('userId');
    if (!gameId) return;
    try {
      await api('/api/matchmaking/leave', {
        method: 'POST',
        body: JSON.stringify({ userId, gameId }),
      });
    } finally {
      setState({ status: 'IDLE' });
    }
  };

  return { ...state, start, cancel };
}