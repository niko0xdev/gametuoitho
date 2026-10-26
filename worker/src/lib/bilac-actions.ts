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
export async function createBiLacMatch(env: Bindings, tournamentId: string, userId: string, playerIds: string[], operationId: string, actor?: TelegramActorBinding, teams?: { teamA: string[]; teamB: string[] }) {
  if (!await memberRole(env, tournamentId, userId)) throw new Error('Bạn cần là thành viên giải đấu.');
  const existing = await env.DB.prepare('SELECT * FROM bilac_matches WHERE id=? AND tournament_id=?').bind(operationId, tournamentId).first<StoredMatch>();
  if (existing) return existing;
  const cancelled = await env.DB.prepare("SELECT 1 FROM bilac_telegram_audit WHERE match_id=? AND tournament_id=? AND after_json=?").bind(operationId, tournamentId, '{"status":"CANCELLED"}').first();
  if (cancelled) throw new Error('Trận này đã được huỷ. Dùng /random để tạo trận mới.');
  const players = (await env.DB.prepare('SELECT id FROM bilac_players WHERE tournament_id=?').bind(tournamentId).all<{ id: string }>()).results;
  const selected = players.filter(p => playerIds.includes(p.id));
  if (selected.length < 2 || selected.length !== new Set(playerIds).size || selected.length !== playerIds.length) throw new Error('Chọn ít nhất 2 người chơi hợp lệ, không trùng nhau.');
  let teamA: string[], teamB: string[], benched: string | null = null;
  if (teams) {
    const assigned = [...teams.teamA, ...teams.teamB];
    if (teams.teamA.length !== 2 || teams.teamB.length !== 2 || new Set(assigned).size !== 4 || selected.length !== 4 || assigned.some(id => !playerIds.includes(id))) throw new Error('Chọn đúng 2 người mỗi đội, không trùng nhau.');
    teamA = teams.teamA; teamB = teams.teamB;
  } else {
    const history = (await env.DB.prepare('SELECT * FROM bilac_matches WHERE tournament_id=?').bind(tournamentId).all<StoredMatch>()).results;
    const paired = pairPlayers(selected, undefined, history.map(m => ({ timestamp: m.timestamp, team1: JSON.parse(m.team1), team2: JSON.parse(m.team2), benched: m.benched })));
    teamA = paired.teamA.map(p => p.id); teamB = paired.teamB.map(p => p.id); benched = paired.sittingOut?.id ?? null;
  }
  const result = await env.DB.prepare(`INSERT OR IGNORE INTO bilac_matches
    (id,tournament_id,timestamp,week_label,team1,team2,benched,score1,score2,status)
    SELECT ?,?,?,?,?,?,?,0,0,'PLAYING' WHERE NOT EXISTS
    (SELECT 1 FROM bilac_matches WHERE tournament_id=? AND status='PLAYING')
    AND EXISTS (SELECT 1 FROM bilac_tournament_members m JOIN users u ON u.id=m.user_id WHERE m.tournament_id=? AND m.user_id=?) AND ${telegramActorSql}
    AND NOT EXISTS (SELECT 1 FROM bilac_telegram_audit WHERE match_id=? AND tournament_id=? AND after_json='{"status":"CANCELLED"}')`)
    .bind(operationId, tournamentId, Date.now(), currentSeason(), JSON.stringify(teamA), JSON.stringify(teamB), benched, tournamentId, tournamentId, userId, ...telegramActorParams(tournamentId, userId, actor), operationId, tournamentId).run();
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

export async function cancelBiLacMatch(env: Bindings, tournamentId: string, userId: string, match: StoredMatch, operationId: string, actor: TelegramActorBinding) {
  if (match.tournament_id !== tournamentId || !await memberRole(env, tournamentId, userId)) throw new Error('Bạn không có quyền huỷ trận này.');
  const auditQuery = 'SELECT 1 FROM bilac_telegram_audit WHERE operation_id=? AND tournament_id=? AND match_id=? AND user_id=?';
  if (await env.DB.prepare(auditQuery).bind(operationId, tournamentId, match.id, userId).first()) return;
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO bilac_telegram_audit (operation_id,tournament_id,match_id,user_id,before_json,after_json,created_at)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM bilac_matches WHERE id=? AND tournament_id=? AND revision=? AND status='PLAYING')
      AND EXISTS (SELECT 1 FROM bilac_tournament_members WHERE tournament_id=? AND user_id=?) AND ${telegramActorSql}`)
      .bind(operationId, tournamentId, match.id, userId, JSON.stringify(match), '{"status":"CANCELLED"}', Date.now(), match.id, tournamentId, match.revision, tournamentId, userId, ...telegramActorParams(tournamentId, userId, actor)),
    env.DB.prepare(`DELETE FROM bilac_matches WHERE id=? AND tournament_id=? AND revision=? AND status='PLAYING'
      AND EXISTS (SELECT 1 FROM bilac_telegram_audit WHERE operation_id=? AND tournament_id=? AND match_id=? AND user_id=?)`)
      .bind(match.id, tournamentId, match.revision, operationId, tournamentId, match.id, userId),
  ]);
  if (!await env.DB.prepare(auditQuery).bind(operationId, tournamentId, match.id, userId).first()) throw new Error('Trận đã thay đổi hoặc kết thúc. Hãy mở lại danh sách trận.');
}
