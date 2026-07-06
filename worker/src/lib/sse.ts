export function formatEvent(event: string, data: unknown): string {
  const json = JSON.stringify(data).replace(/\n/g, '\\n');
  return `event: ${event}\ndata: ${json}\n\n`;
}

export function formatComment(text: string): string {
  return `: ${text}\n\n`;
}

type SseHandlers = {
  onConnect: (send: (event: string, data: unknown) => void, close: () => void) => void | (() => void);
  heartbeatMs?: number;
};

export function sseStream(handlers: SseHandlers): Response {
  const encoder = new TextEncoder();
  let cleanup: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(formatEvent(event, data)));
        } catch {
          // connection closed
        }
      };
      const close = () => {
        try { controller.close(); } catch { /* already closed */ }
      };

      // initial comment to flush headers
      controller.enqueue(encoder.encode(formatComment('connected')));

      const teardown = handlers.onConnect(send, close);
      cleanup = typeof teardown === 'function' ? teardown : undefined;

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(formatComment('ping')));
        } catch {
          // closed
        }
      }, handlers.heartbeatMs ?? 30000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (cleanup) cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
