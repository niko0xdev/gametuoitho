import { describe, expect, it } from 'vitest';
import { currentSeason, standings, renderStandings, scoreInput, scheduledSlot } from '../../shared/bilac-telegram';

describe('Telegram tournament rules', () => {
  it('preserves the Wednesday season label transition independently of host timezone', () => {
    expect(currentSeason(new Date('2026-10-21T04:29:00Z'))).toBe('Tuần từ 14/10/2026 đến 21/10/2026');
    expect(currentSeason(new Date('2026-10-21T04:30:00Z'))).toBe('Tuần từ 21/10/2026 đến 28/10/2026');
    expect(currentSeason(new Date('2026-10-21T05:00:00Z'))).toBe('Tuần từ 21/10/2026 đến 28/10/2026');
  });
  it('ranks by match differential, with draws excluded from played count', () => {
    const rows = standings([{ id: 'a', name: 'An' }, { id: 'b', name: 'Bình' }, { id: 'c', name: 'Chi' }], [
      { team1: ['a'], team2: ['b'], score1: 1, score2: 0, status: 'FINISHED', weekLabel: 'week' },
      { team1: ['a'], team2: ['b'], score1: 5, score2: 5, status: 'FINISHED', weekLabel: 'week' },
    ], 'week');
    expect(rows.map(r => r.id)).toEqual(['a', 'b']);
    expect(rows[0]).toMatchObject({ wins: 1, draws: 1, played: 1, diff: 1 });
    expect(renderStandings('Cup', 'week', rows, 'https://example.test')).toContain('An');
  });
  it('rejects invalid or unbounded score inputs', () => {
    expect(scoreInput('10', '7')).toEqual([10, 7]);
    for (const v of ['-1', '1.2', 'NaN', '1000', '']) expect(() => scoreInput(v, '1')).toThrow();
  });
  it('maps only the intended schedule triggers to Vietnam slots', () => {
    expect(scheduledSlot('20 6 * * *')).toBe('13:20');
    expect(scheduledSlot('0 14 * * *')).toBe('21:00');
    expect(scheduledSlot('13 */6 * * *')).toBeNull();
  });
});
