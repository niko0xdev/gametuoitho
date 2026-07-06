import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

export type MatchmakingState = {
  status: 'IDLE' | 'WAITING' | 'MATCHED';
  matchId?: string;
  opponentId?: string;
  error?: string;
};

const MAX_RECONNECTS = 5;
const POLL_INTERVAL_MS = 3000; // Fallback polling when SSE keeps failing

export function useMatchmaking(gameId: string | null): MatchmakingState & {
  start: () => void;
  cancel: () => void;
} {
  const [state, setState] = useState<MatchmakingState>({ status: 'IDLE' });
  const reconnectAttemptsRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // F2: SSE reconnection + polling fallback. Mitigates per-isolate state loss on Workers.
  useEffect(() => {
    if (!gameId || state.status !== 'WAITING') return;
    const userId = localStorage.getItem('auth_userId');
    if (!userId) {
      setState({ status: 'IDLE', error: 'Not logged in' });
      return;
    }

    let cancelled = false;
    let es: EventSource | null = null;

    const startPollFallback = () => {
      // After max reconnects, fall back to polling. The server doesn't have a
      // /matchmaking/poll endpoint yet; for now we just stop and surface an error.
      // The opponent's match will land in D1 — the user's next /api/matchmaking/join
      // attempt (or page reload) will pick it up via REST.
      setState({ status: 'IDLE', error: 'Kết nối thất bại. Vui lòng thử lại.' });
    };

    const connect = () => {
      if (cancelled) return;
      const url = `${import.meta.env.VITE_API_BASE}/api/matchmaking/stream?userId=${encodeURIComponent(userId)}&gameId=${encodeURIComponent(gameId)}`;
      es = new EventSource(url);

      es.addEventListener('matched', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        if (cancelled) return;
        setState({ status: 'MATCHED', matchId: data.matchId, opponentId: data.opponentId });
        es?.close();
      });

      es.addEventListener('open', () => {
        reconnectAttemptsRef.current = 0; // Reset on successful connect
      });

      es.onerror = () => {
        es?.close();
        if (cancelled) return;
        if (reconnectAttemptsRef.current >= MAX_RECONNECTS) {
          startPollFallback();
          return;
        }
        reconnectAttemptsRef.current++;
        // Exponential backoff: 500ms, 1s, 2s, 4s, 8s
        const delay = 500 * Math.pow(2, reconnectAttemptsRef.current - 1);
        setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      cancelled = true;
      es?.close();
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [gameId, state.status]);

  const start = async () => {
    if (!gameId) return;
    setState({ status: 'WAITING' });
    const userId = localStorage.getItem('auth_userId');
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
    const userId = localStorage.getItem('auth_userId');
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