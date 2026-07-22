export function normalizeRoomCode(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase().slice(0, 6);
}

export function isValidRoomCode(value: string): boolean {
  return /^[A-Z0-9]{6}$/.test(value);
}
