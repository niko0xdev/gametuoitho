import { describe, it, expect } from 'vitest';
import { formatEvent, sseStream } from '../src/lib/sse';

describe('formatEvent', () => {
  it('formats a typed event with json data', () => {
    expect(formatEvent('matched', { matchId: 'm1', opponentId: 'u2' })).toBe(
      'event: matched\ndata: {"matchId":"m1","opponentId":"u2"}\n\n'
    );
  });

  it('escapes newlines in data', () => {
    const out = formatEvent('msg', { text: 'a\nb' });
    expect(out).toContain('data: {"text":"a\\nb"}');
  });
});

describe('sseStream', () => {
  it('returns a Response with correct headers', () => {
    const res = sseStream({ onConnect: () => {}, heartbeatMs: 30000 });
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    expect(res.headers.get('Connection')).toBe('keep-alive');
  });
});
