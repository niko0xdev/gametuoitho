import { describe, it, expect } from 'vitest';
import { caroEngine } from '../src/game/rules';

// Step 1 of the gameplay WS port: verify the rule engines compile + run in the
// Worker bundle. Caro stands in for the whole engine set.
describe('caro rule engine (ported to worker)', () => {
  it('initial state: 15x15 empty board, turn 0', () => {
    const s = caroEngine.getInitialState(['p1', 'p2']);
    expect(s.board.length).toBe(15);
    expect(s.board[0].length).toBe(15);
    expect(s.board.every((row: any[]) => row.every((cell: unknown) => cell === null))).toBe(true);
    expect(s.turnIndex).toBe(0);
  });

  it('accepts a valid move and flips turn', () => {
    const s = caroEngine.getInitialState(['p1', 'p2']);
    const r = caroEngine.validateMove(s, { r: 7, c: 7 }, 'p1', ['p1', 'p2']);
    expect(r.valid).toBe(true);
    expect(r.newState.turnIndex).toBe(1);
    expect(r.newState.board[7][7]).not.toBeNull();
  });

  it('rejects an off-turn move', () => {
    const s = caroEngine.getInitialState(['p1', 'p2']);
    const r = caroEngine.validateMove(s, { r: 0, c: 0 }, 'p2', ['p1', 'p2']);
    expect(r.valid).toBe(false);
  });

  it('rejects an out-of-bounds move', () => {
    const s = caroEngine.getInitialState(['p1', 'p2']);
    const r = caroEngine.validateMove(s, { r: 99, c: 99 }, 'p1', ['p1', 'p2']);
    expect(r.valid).toBe(false);
  });
});
