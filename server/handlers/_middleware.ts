// Express types from server.ts inline middleware, extracted verbatim.
import type { Request, Response, NextFunction } from 'express';
import { db } from '../db.ts';

export function getRequestUserId(req: any): string | null {
  // Header-only — never trust body/query for identity (impersonation risk).
  // Mirrors worker/src/lib/auth.ts. requireLoggedIn still validates the user exists.
  const uid = req.headers['x-user-id'];
  return typeof uid === 'string' && uid.trim() ? uid.trim() : null;
}

export function requireLoggedIn(req: any, res: any): string | null {
  const uid = getRequestUserId(req);
  if (!uid) {
    res.status(401).json({ error: 'Vui lòng đăng nhập để tiếp tục!' });
    return null;
  }
  const user = db.getUser(uid);
  if (!user) {
    res.status(401).json({ error: 'Tài khoản không tồn tại hoặc đã bị xoá. Vui lòng đăng nhập lại!' });
    return null;
  }
  return uid;
}

export function checkBiLacTournamentAccess(req: any, res: any, next: NextFunction) {
  const tournamentId = req.headers['x-tournament-id'] || req.query.tournamentId;
  const code = req.headers['x-tournament-code'] || req.query.code;

  if (!tournamentId) {
    return res.status(401).json({ error: 'Thiếu mã giải đấu (Tournament ID)!' });
  }

  const tour = db.getBiLacTournament(tournamentId as string);
  if (!tour) {
    return res.status(404).json({ error: 'Không tìm thấy giải đấu này!' });
  }

  if (tour.code !== code) {
    return res.status(403).json({ error: 'Mã code truy cập không chính xác!' });
  }

  const uid = requireLoggedIn(req, res);
  if (!uid) return;
  if (!db.isBiLacTournamentMember(tournamentId as string, uid)) {
    return res.status(403).json({ error: 'Bạn chưa là thành viên của giải đấu này. Vui lòng nhập mã code để tham gia!' });
  }

  req.tournamentId = tournamentId;
  req.userId = uid;
  next();
}

export function requireBiLacMember(req: any, res: any, next: NextFunction) {
  const uid = requireLoggedIn(req, res);
  if (!uid) return;
  const tournamentId = req.tournamentId || req.headers['x-tournament-id'] || req.query.tournamentId || req.body?.tournamentId;
  if (!tournamentId) {
    return res.status(400).json({ error: 'Thiếu mã giải đấu!' });
  }
  const tour = db.getBiLacTournament(tournamentId);
  if (!tour) {
    return res.status(404).json({ error: 'Không tìm thấy giải đấu này!' });
  }
  if (tour.code !== (req.headers['x-tournament-code'] || req.query.code)) {
    return res.status(403).json({ error: 'Mã code truy cập không chính xác!' });
  }
  const isMember = db.isBiLacTournamentMember(tournamentId, uid);
  if (!isMember) {
    return res.status(403).json({ error: 'Bạn không phải thành viên của giải đấu này! Vui lòng liên hệ chủ giải để được thêm vào.' });
  }
  req.userId = uid;
  req.tournamentId = tournamentId;
  next();
}

export function requireBiLacOwner(req: any, res: any, next: NextFunction) {
  const uid = requireLoggedIn(req, res);
  if (!uid) return;
  const tournamentId = req.tournamentId || req.headers['x-tournament-id'] || req.query.tournamentId || req.body?.tournamentId;
  if (!tournamentId) {
    return res.status(400).json({ error: 'Thiếu mã giải đấu!' });
  }
  const tour = db.getBiLacTournament(tournamentId);
  if (!tour) {
    return res.status(404).json({ error: 'Không tìm thấy giải đấu này!' });
  }
  if (tour.code !== (req.headers['x-tournament-code'] || req.query.code)) {
    return res.status(403).json({ error: 'Mã code truy cập không chính xác!' });
  }
  if (!db.isBiLacTournamentOwner(tournamentId, uid)) {
    return res.status(403).json({ error: 'Chỉ chủ giải mới có quyền thực hiện thao tác này!' });
  }
  req.userId = uid;
  req.tournamentId = tournamentId;
  next();
}