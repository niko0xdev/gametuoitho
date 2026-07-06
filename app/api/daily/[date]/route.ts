import { NextResponse } from 'next/server';
import { dailyChallengeManager } from '@/server/dailyChallengeManager';

const DEFAULT_GAME = 'doan_tu';

export async function GET(req: Request, ctx: { params: { date: string } }) {
  const url = new URL(req.url);
  const gameId = url.searchParams.get('gameId') ?? DEFAULT_GAME;
  return NextResponse.json(dailyChallengeManager.getOrCreateChallenge(gameId, ctx.params.date));
}