import { describe, it, expect } from 'vitest';
import { wsMessage } from '../src/lib/ws';

describe('wsMessage', () => {
  it('flattens event + payload into one object', () => {
    const parsed = JSON.parse(wsMessage('move', { userId: 'u1', move: 'e4', ts: 5 }));
    expect(parsed).toEqual({ event: 'move', userId: 'u1', move: 'e4', ts: 5 });
  });

  it('carries the matched payload fields', () => {
    const parsed = JSON.parse(wsMessage('matched', { matchId: 'm1', opponentId: 'u2' }));
    expect(parsed.event).toBe('matched');
    expect(parsed.matchId).toBe('m1');
    expect(parsed.opponentId).toBe('u2');
  });

  it('produces valid JSON the client can parse', () => {
    expect(() => JSON.parse(wsMessage('ended', { winner: null, reason: 'forfeit' }))).not.toThrow();
  });
});
