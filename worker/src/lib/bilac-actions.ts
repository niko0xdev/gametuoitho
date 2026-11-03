import { telegramActorSql, telegramActorParams, type TelegramActorBinding } from './telegram-config';
import type { Bindings } from '../db';
import { pairPlayers, pairFourPlayers } from './pairing';
import { currentSeason } from '../../../shared/bilac-telegram';

export interface StoredMatch {
  id: string; tournament_id: string; timestamp: number; week_label: string; team1: string; team2: string;
  match_mode?: 'normal' | 'timeout'; sitting_out?: string;
  result_multiplier?: number; source_match_id?: string | null;
  benched: string | null; score1: number; score2: number; status: string; revision: number;
}
export async function memberRole(env: Bindings, tournamentId: string, userId: string): Promise<string | null> {
  const row = await env.DB.prepare(`SELECT m.role FROM bilac_tournament_members m JOIN users u ON u.id=m.user_id
    WHERE m.tournament_id=? AND m.user_id=?`).bind(tournamentId, userId).first<{ role: string }>();
  return row?.role ?? null;
}
export async function createBiLacMatch(env: Bindings, tournamentId: string, userId: string, playerIds: string[], operationId: string, actor?: TelegramActorBinding, teams?: { teamA: string[]; teamB: string[] }, resultMultiplier = 1, matchMode: 'normal' | 'timeout' = 'normal') {
  if (matchMode !== 'normal' && matchMode !== 'timeout') throw new Error('Chế độ trận đấu không hợp lệ.');
  if (teams && matchMode === 'timeout') throw new Error('Chế độ Hết giờ tự chọn ngẫu nhiên 4 người.');
  if (resultMultiplier !== 1 && resultMultiplier !== 10) throw new Error('Chọn chế độ thường hoặc ×10.');
  if (!await memberRole(env, tournamentId, userId)) throw new Error('Bạn cần là thành viên giải đấu.');
  const existing = await env.DB.prepare('SELECT * FROM bilac_matches WHERE id=? AND tournament_id=?').bind(operationId, tournamentId).first<StoredMatch>();
  if (existing) {
    if ((existing.result_multiplier ?? 1) !== resultMultiplier || (existing.match_mode ?? 'normal') !== matchMode) throw new Error('Trận đã được tạo với chế độ khác.');
    return existing;
  }
  const cancelled = await env.DB.prepare("SELECT 1 FROM bilac_telegram_audit WHERE match_id=? AND tournament_id=? AND after_json=?").bind(operationId, tournamentId, '{"status":"CANCELLED"}').first();
  if (cancelled) throw new Error('Trận này đã được huỷ. Dùng /random để tạo trận mới.');
  const players = (await env.DB.prepare('SELECT id FROM bilac_players WHERE tournament_id=?').bind(tournamentId).all<{ id: string }>()).results;
  const selected = players.filter(p => playerIds.includes(p.id));
  if (selected.length < 2 || selected.length !== new Set(playerIds).size || selected.length !== playerIds.length) throw new Error('Chọn ít nhất 2 người chơi hợp lệ, không trùng nhau.');
  if (matchMode === 'timeout' && selected.length < 4) throw new Error('Chọn ít nhất 4 người cho chế độ Hết giờ.');
  let sittingOut: string[] = [];
  let teamA: string[], teamB: string[], benched: string | null = null;
  if (teams) {
    const assigned = [...teams.teamA, ...teams.teamB];
    if (teams.teamA.length !== 2 || teams.teamB.length !== 2 || new Set(assigned).size !== 4 || selected.length !== 4 || assigned.some(id => !playerIds.includes(id))) throw new Error('Chọn đúng 2 người mỗi đội, không trùng nhau.');
    teamA = teams.teamA; teamB = teams.teamB;
  } else {
    const history = (await env.DB.prepare('SELECT * FROM bilac_matches WHERE tournament_id=?').bind(tournamentId).all<StoredMatch>()).results;
    const pairingHistory = history.map(m => ({ timestamp: m.timestamp, team1: JSON.parse(m.team1), team2: JSON.parse(m.team2), benched: m.benched }));
    if (matchMode === 'timeout') {
      const paired = pairFourPlayers(selected, undefined, pairingHistory);
      teamA = paired.teamA.map(p => p.id); teamB = paired.teamB.map(p => p.id); sittingOut = paired.sittingOut.map(p => p.id);
    } else {
      const paired = pairPlayers(selected, undefined, pairingHistory);
      teamA = paired.teamA.map(p => p.id); teamB = paired.teamB.map(p => p.id); benched = paired.sittingOut?.id ?? null;
    }
  }
  const insertion = env.DB.prepare(`INSERT OR IGNORE INTO bilac_matches
    (id,tournament_id,timestamp,week_label,team1,team2,benched,result_multiplier,match_mode,sitting_out,score1,score2,status)
    SELECT ?,?,?,?,?,?,?,?,?,?,0,0,'PLAYING' WHERE NOT EXISTS
    (SELECT 1 FROM bilac_matches WHERE tournament_id=? AND status='PLAYING')
    AND EXISTS (SELECT 1 FROM bilac_tournament_members m JOIN users u ON u.id=m.user_id WHERE m.tournament_id=? AND m.user_id=?) AND ${telegramActorSql}
    AND NOT EXISTS (SELECT 1 FROM bilac_telegram_audit WHERE match_id=? AND tournament_id=? AND after_json='{"status":"CANCELLED"}')`)
    .bind(operationId, tournamentId, Date.now(), currentSeason(), JSON.stringify(teamA), JSON.stringify(teamB), benched, resultMultiplier, matchMode, JSON.stringify(sittingOut), tournamentId, tournamentId, userId, ...telegramActorParams(tournamentId, userId, actor), operationId, tournamentId);
  const result = actor?.groupMember ? (await env.DB.batch([
    insertion,
    env.DB.prepare(`INSERT OR IGNORE INTO bilac_telegram_audit (operation_id,tournament_id,match_id,user_id,before_json,after_json,created_at)
      SELECT ?,?,?,?,NULL,?,? WHERE EXISTS (SELECT 1 FROM bilac_matches WHERE id=? AND tournament_id=?) AND ${telegramActorSql}`)
      .bind('create:' + operationId, tournamentId, operationId, userId, JSON.stringify({ source: 'telegram-group', telegramId: actor.telegramId, chatId: actor.chatId, teamA, teamB, resultMultiplier, matchMode, sittingOut, status: 'PLAYING' }), Date.now(), operationId, tournamentId,
        ...telegramActorParams(tournamentId, userId, actor)),
  ]))[0] : await insertion.run();
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
  if (match.source_match_id) throw new Error(`Bạn hãy cập nhật trận gốc #${match.source_match_id} để sửa cả 10 kết quả.`);
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
  if (match.source_match_id) throw new Error(`Bạn hãy cập nhật trận gốc #${match.source_match_id} để sửa cả 10 kết quả.`);
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
