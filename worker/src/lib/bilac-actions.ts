import { telegramActorSql, telegramActorParams, type TelegramActorBinding } from './telegram-config';
import type { Bindings } from '../db';
import { pairPlayers } from './pairing';
import { currentSeason } from '../../../shared/bilac-telegram';

export interface StoredMatch {
  id: string; tournament_id: string; timestamp: number; week_label: string; team1: string; team2: string;
  benched: string | null; score1: number; score2: number; status: string; revision: number;
}
export async function memberRole(env: Bindings, tournamentId: string, userId: string): Promise<string | null> {
  const row = await env.DB.prepare(`SELECT m.role FROM bilac_tournament_members m JOIN users u ON u.id=m.user_id
    WHERE m.tournament_id=? AND m.user_id=?`).bind(tournamentId, userId).first<{ role: string }>();
  return row?.role ?? null;
}
export async function createBiLacMatch(env: Bindings, tournamentId: string, userId: string, playerIds: string[], operationId: string, actor?: TelegramActorBinding) {
  if (!await memberRole(env, tournamentId, userId)) throw new Error('Bạn cần là thành viên giải đấu.');
  const existing = await env.DB.prepare('SELECT * FROM bilac_matches WHERE id=? AND tournament_id=?').bind(operationId, tournamentId).first<StoredMatch>();
  if (existing) return existing;
  const players = (await env.DB.prepare('SELECT id FROM bilac_players WHERE tournament_id=?').bind(tournamentId).all<{ id: string }>()).results;
  const selected = players.filter(p => playerIds.includes(p.id));
  if (selected.length < 2 || selected.length !== new Set(playerIds).size || selected.length !== playerIds.length) throw new Error('Chọn ít nhất 2 người chơi hợp lệ, không trùng nhau.');
  const history = (await env.DB.prepare('SELECT * FROM bilac_matches WHERE tournament_id=?').bind(tournamentId).all<StoredMatch>()).results;
  const { teamA, teamB, sittingOut } = pairPlayers(selected, undefined, history.map(m => ({ timestamp: m.timestamp, team1: JSON.parse(m.team1), team2: JSON.parse(m.team2), benched: m.benched })));
  const result = await env.DB.prepare(`INSERT OR IGNORE INTO bilac_matches
    (id,tournament_id,timestamp,week_label,team1,team2,benched,score1,score2,status)
    SELECT ?,?,?,?,?,?,?,0,0,'PLAYING' WHERE NOT EXISTS
    (SELECT 1 FROM bilac_matches WHERE tournament_id=? AND status='PLAYING')
    AND EXISTS (SELECT 1 FROM bilac_tournament_members m JOIN users u ON u.id=m.user_id WHERE m.tournament_id=? AND m.user_id=?) AND ${telegramActorSql}`)
    .bind(operationId, tournamentId, Date.now(), currentSeason(), JSON.stringify(teamA.map(p => p.id)), JSON.stringify(teamB.map(p => p.id)), sittingOut?.id ?? null, tournamentId, tournamentId, userId, ...telegramActorParams(tournamentId, userId, actor)).run();
  if (!result.meta.changes) {
    const replay = await env.DB.prepare('SELECT * FROM bilac_matches WHERE id=? AND tournament_id=?').bind(operationId, tournamentId).first<StoredMatch>();
    if (replay) return replay;
    throw new Error('Giải đang có trận chưa kết thúc. Hãy cập nhật kết quả trước nhé!');
  }
  return (await env.DB.prepare('SELECT * FROM bilac_matches WHERE id=? AND tournament_id=?').bind(operationId, tournamentId).first<StoredMatch>())!;
}

export async function saveBiLacScore(env: Bindings, tournamentId: string, userId: string, match: StoredMatch, scores: [number, number], finish: boolean, operationId: string, actor?: TelegramActorBinding) {
  const role = await memberRole(env, tournamentId, userId);
  if (!role || (match.status === 'FINISHED' && role !== 'owner')) throw new Error('Bạn không có quyền cập nhật kết quả này.');
  if (match.tournament_id !== tournamentId) throw new Error('Bạn không có quyền cập nhật trận của giải khác.');
  const audit = await env.DB.prepare('SELECT 1 FROM bilac_telegram_audit WHERE operation_id=? AND tournament_id=? AND match_id=? AND user_id=?').bind(operationId, tournamentId, match.id, userId).first();
  if (audit) return;
  const after = { score1: scores[0], score2: scores[1], status: finish || match.status === 'FINISHED' ? 'FINISHED' : 'PLAYING' };
  // The audit insert and conditional mutation share one D1 transaction.
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO bilac_telegram_audit (operation_id,tournament_id,match_id,user_id,before_json,after_json,created_at)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM bilac_matches WHERE id=? AND tournament_id=? AND revision=?)
      AND EXISTS (SELECT 1 FROM bilac_tournament_members m JOIN users u ON u.id=m.user_id WHERE m.tournament_id=? AND m.user_id=? AND (?!='FINISHED' OR m.role='owner')) AND ${telegramActorSql}`)
      .bind(operationId, tournamentId, match.id, userId, JSON.stringify(match), JSON.stringify(after), Date.now(), match.id, tournamentId, match.revision, tournamentId, userId, match.status, ...telegramActorParams(tournamentId, userId, actor)),
    env.DB.prepare(`UPDATE bilac_matches SET score1=?,score2=?,status=?,revision=revision+1
      WHERE id=? AND tournament_id=? AND revision=? AND EXISTS (SELECT 1 FROM bilac_telegram_audit WHERE operation_id=? AND tournament_id=? AND match_id=? AND user_id=?)`)
      .bind(after.score1, after.score2, after.status, match.id, tournamentId, match.revision, operationId, tournamentId, match.id, userId),
  ]);
  if (!await env.DB.prepare('SELECT 1 FROM bilac_telegram_audit WHERE operation_id=? AND tournament_id=? AND match_id=? AND user_id=?').bind(operationId, tournamentId, match.id, userId).first()) throw new Error('Trận đã thay đổi. Hãy nhập lại kết quả mới nhất.');
}
