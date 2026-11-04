export const resultMultipliers = [1, 2, 3, 5, 8, 13] as const;
export type ResultMultiplier = typeof resultMultipliers[number] | 10;

export function isResultMultiplier(value: unknown): value is ResultMultiplier {
  return typeof value === 'number' && (value === 10 || (resultMultipliers as readonly number[]).includes(value));
}

export function storedResultMultiplier(match: { result_factor?: number | null; result_multiplier?: number }): number {
  return match.result_factor ?? match.result_multiplier ?? 1;
}
