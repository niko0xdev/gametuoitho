import { NextResponse } from 'next/server';
import { db } from '@/server/db';

export async function GET(_req: Request, ctx: { params: { userId: string } }) {
  const matches = db.getAllMatches().filter(
    (m: any) => m.status === 'ENDED' && Array.isArray(m.players) && m.players.includes(ctx.params.userId),
  );
  return NextResponse.json(matches);
}