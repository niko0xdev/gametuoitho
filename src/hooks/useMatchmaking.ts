import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

export type MatchmakingState = {
  status: 'IDLE' | 'WAITING' | 'MATCHED';
  matchId?: string;
  opponentId?: string;
  error?: string;
};

const MAX_RECONNECTS = 5;

// Derive ws:// or wss:// from the API base (http:// → ws://, https:// → wss://).
const wsBase = (import.meta.env.VITE_API_BASE as string).replace(/^http/, 'ws');

export function useMatchmaking(gameId: string | null): MatchmakingState & {
  start: () => void;
  cancel: () => void;
} {
  const [state, setState] = useState<MatchmakingState>({ status: 'IDLE' });
  const reconnectAttemptsRef = useRef(0);

  // WebSocket subscription while WAITING: the per-game Durable Object pushes
  // 'matched' the moment an opponent joins. Replaces the old per-isolate SSE
  // stream (which broke across Worker isolates).
  useEffect(() => {
    if (!gameId || state.status !== 'WAITING') return;
    const userId = localStorage.getItem('auth_userId');
    if (!userId) {
      setState({ status: 'IDLE', error: 'Not logged in' });
      return;
    }

    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      if (cancelled) return;
      ws = new WebSocket(
        `${wsBase}/api/matchmaking/ws?userId=${encodeURIComponent(userId)}&gameId=${encodeURIComponent(gameId)}`
      );

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (cancelled) return;
        if (data.event === 'matched') {
          setState({ status: 'MATCHED', matchId: data.matchId, opponentId: data.opponentId });
          ws?.close();
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        if (reconnectAttemptsRef.current >= MAX_RECONNECTS) {
          setState({ status: 'IDLE', error: 'Kết nối thất bại. Vui lòng thử lại.' });
          return;
        }
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
