import { describe, expect, it } from 'vitest';
import { createLatestRequestGate } from '../src/lib/latestRequest';

describe('Bi Lac request gate', () => {
  it('discards an older read after a newer read begins', () => {
    const gate = createLatestRequestGate();
    const oldRead = gate.begin();
    const refresh = gate.begin();
    expect(gate.isCurrent(oldRead)).toBe(false);
    expect(gate.isCurrent(refresh)).toBe(true);
  });

  it('discards a pending read when a write starts or completes', () => {
    const gate = createLatestRequestGate();
    const readBeforeWrite = gate.begin();
    gate.invalidate(); // write begins
    expect(gate.isCurrent(readBeforeWrite)).toBe(false);

    const readDuringWrite = gate.begin();
    gate.invalidate(); // write completes
    expect(gate.isCurrent(readDuringWrite)).toBe(false);
    expect(gate.isCurrent(gate.begin())).toBe(true);
  });

  it('invalidates data fetched from a tournament that was just left', () => {
    const gate = createLatestRequestGate();
    const previousTournamentRead = gate.begin();
    gate.invalidate(); // unmount/switch
    expect(gate.isCurrent(previousTournamentRead)).toBe(false);
  });
});
