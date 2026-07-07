import { useEffect, useRef, useState } from 'react';

export type MatchmakingState = {
  status: 'IDLE' | 'WAITING' | 'MATCHED';
  matchId?: string;
  opponentId?: string;
  error?: string;
};

const MAX_RECONNECTS = 5;

const wsBase = () => ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/^http/, 'ws');

export function useMatchmaking(gameId: string | null): MatchmakingState & {
  start: () => void;
  cancel: () => void;
} {
  const [state, setState] = useState<MatchmakingState>({ status: 'IDLE' });
  const reconnectAttemptsRef = useRef(0);

  // Opening the matchmaking WebSocket IS joining the queue. The per-game
  // Durable Object pairs on connect and pushes 'matched' when an opponent
  // arrives — and the waiting set survives DO eviction. Replaces the old
  // per-isolate SSE stream.
  useEffect(() => {
    if (!gameId || state.status !== 'WAITING') return;
    const userId = localStorage.getItem('auth_userId');
    if (!userId) {
      setState({ status: 'IDLE', error: 'Not logged in' });
      return;
    }
    reconnectAttemptsRef.current = 0;

    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const scheduleReconnect = () => {
      if (cancelled) return;
      if (reconnectAttemptsRef.current >= MAX_RECONNECTS) {
        setState({ status: 'IDLE', error: 'Kết nối thất bại. Vui lòng thử lại.' });
        return;
      }
      reconnectAttemptsRef.current++;
      const delay = 500 * Math.pow(2, reconnectAttemptsRef.current - 1);
      reconnectTimer = setTimeout(connect, delay);
    };

    const connect = () => {
      if (cancelled) return;
      try {
        ws = new WebSocket(
          `${wsBase()}/api/matchmaking/ws?userId=${encodeURIComponent(userId)}&gameId=${encodeURIComponent(gameId)}`
        );
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (e) => {
        let data: any;
        try {
          data = JSON.parse(e.data);
        } catch {
          return;
        }
        if (cancelled) return;
        if (data.event === 'matched') {
          setState({ status: 'MATCHED', matchId: data.matchId, opponentId: data.opponentId });
          ws?.close();
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        scheduleReconnect();
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

  const start = () => {
    setState({ status: 'WAITING' });
  };

  const cancel = () => {
    setState({ status: 'IDLE' });
  };

  return { ...state, start, cancel };
}
