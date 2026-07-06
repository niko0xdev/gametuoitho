import { NextResponse } from 'next/server';
import { dailyChallengeManager } from '@/server/dailyChallengeManager';

// ponytail: legacy legacy mounted /api/challenges/:gameId/:date. PR #5 collapses
// it to /api/daily (today) and /api/daily/:date (by date). gameId defaults to
// 'doan_tu' so the SPA can drop gameId from the URL. upgrade path: accept a
// `?gameId=` query to restore the multi-game picker once the frontend cares.
const DEFAULT_GAME = 'doan_tu';

function todayDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const gameId = url.searchParams.get('gameId') ?? DEFAULT_GAME;
  return NextResponse.json(dailyChallengeManager.getOrCreateChallenge(gameId, todayDateStr()));
}