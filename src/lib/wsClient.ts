export type WsClient = { send: (msg: unknown) => void; close: () => void };

export function createWsClient(opts: {
  onMessage: (msg: unknown) => void;
  getUserId?: () => string | null;
}): WsClient {
  const base = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001/ws';
  const uid = opts.getUserId?.() ?? '';
  const url = uid ? `${base}?userId=${encodeURIComponent(uid)}` : base;
  let ws: WebSocket | null = null;
  let closed = false;
  const open = () => {
    ws = new WebSocket(url);
    ws.onmessage = (e) => {
      try { opts.onMessage(JSON.parse(String(e.data))); } catch { opts.onMessage(e.data); }
    };
    ws.onclose = () => { if (!closed) setTimeout(open, 1500); };
  };
  open();
  return {
    send: (msg) => ws?.readyState === 1 && ws.send(JSON.stringify(msg)),
    close: () => { closed = true; ws?.close(); },
  };
}
