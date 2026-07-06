import { NextResponse, type NextRequest } from 'next/server';
import { openDb } from '@/server/db';

export type AuthCtx = { userId: string };

export async function requireLoggedIn(req: NextRequest): Promise<AuthCtx | NextResponse> {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  return { userId };
}

export async function getLoggedIn(req: NextRequest): Promise<AuthCtx | null> {
  const userId = req.headers.get('x-user-id');
  return userId ? { userId } : null;
}

export async function checkBiLacTournamentAccess(
  req: NextRequest,
): Promise<{ userId: string; tournamentId: string; code: string } | NextResponse> {
  const userId = req.headers.get('x-user-id');
  const tournamentId = req.headers.get('x-tournament-id');
  const code = req.headers.get('x-tournament-code');
  if (!userId || !tournamentId || !code) {
    return NextResponse.json({ error: 'Thiếu thông tin truy cập' }, { status: 403 });
  }
  const db = openDb();
  const t = db.prepare('SELECT code FROM bilac_tournaments WHERE id = ?').get(tournamentId) as { code: string } | undefined;
  if (!t || t.code !== code) {
    return NextResponse.json({ error: 'Mã giải đấu không hợp lệ' }, { status: 403 });
  }
  return { userId, tournamentId, code };
}

export async function requireBiLacMember(
  ctx: { userId: string; tournamentId: string },
): Promise<{ userId: string; tournamentId: string; role: 'owner' | 'member' } | NextResponse> {
  const db = openDb();
  const row = db
    .prepare('SELECT role FROM bilac_tournament_members WHERE tournament_id = ? AND user_id = ?')
    .get(ctx.tournamentId, ctx.userId) as { role: 'owner' | 'member' } | undefined;
  if (!row) return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 });
  return { ...ctx, role: row.role };
}

export async function requireBiLacOwner(
  ctx: { userId: string; tournamentId: string },
): Promise<{ userId: string; tournamentId: string } | NextResponse> {
  const db = openDb();
  const row = db
    .prepare(`SELECT 1 FROM bilac_tournament_members WHERE tournament_id = ? AND user_id = ? AND role = 'owner'`)
    .get(ctx.tournamentId, ctx.userId);
  if (!row) return NextResponse.json({ error: 'Cần quyền chủ giải' }, { status: 403 });
  return ctx;
}
