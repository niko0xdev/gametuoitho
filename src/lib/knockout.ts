/**
 * Winner of a single knockout fixture, or null for a draw.
 * Draw returns null (never falls through to the away team) so the caller
 * must handle a replay/empty slot instead of silently advancing away.
 */
export function knockoutWinner(
  homeId: string,
  awayId: string,
  homeScore: number,
  awayScore: number
): string | null {
  if (homeScore > awayScore) return homeId;
  if (awayScore > homeScore) return awayId;
  return null;
}
