import type { Game } from '../types.ts';

/**
 * Canonical display name for a game. gamesData names are already complete
 * ("Caro", "Cờ Tướng", "Đuổi Hình Bắt Chữ") — never auto-prefix with "Cờ".
 */
export function gameDisplayName(game: Game | undefined): string {
  return game?.name ?? '';
}
