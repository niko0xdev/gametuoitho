import type { Request, Response } from 'express';
import { db } from '../db.ts';
import { requireLoggedIn } from './_middleware.ts';

// Mutating league routes require a permitted caller (mirrors handleListLeagues).
// Reuse the canonical requireLoggedIn so identity extraction (header || body ||
// query) and the user-existence check stay consistent with every other route.
function requireLeaguePermission(req: Request, res: Response): boolean {
  const uid = requireLoggedIn(req, res);
  if (!uid) return false;
  const perms = db.getLeaguePermissions();
  if (perms[uid] !== true) {
    res.status(403).json({ error: 'Quyền truy cập bị hạn chế' });
    return false;
  }
  return true;
}

export function handleListLeagues(req: Request, res: Response) {
  const { userId } = req.query;
  if (userId) {
    const perms = db.getLeaguePermissions();
    if (perms[userId as string] !== true) {
      return res.status(403).json({ error: 'Quyền truy cập bị hạn chế' });
    }
  }
  res.json(db.getAllMyLeagues());
}

export function handleCreateLeague(req: Request, res: Response) {
  if (!requireLeaguePermission(req, res)) return;
  const league = req.body;
  if (!league || !league.id || !league.name) {
    return res.status(400).json({ error: 'Dữ liệu giải đấu không hợp lệ!' });
  }
  db.saveMyLeague(league);
  res.json(league);
}

export function handlePutLeague(req: Request, res: Response) {
  if (!requireLeaguePermission(req, res)) return;
  const league = req.body;
  if (!league || !league.id || !league.name) {
    return res.status(400).json({ error: 'Dữ liệu giải đấu không hợp lệ!' });
  }
  db.saveMyLeague(league);
  res.json(league);
}

export function handleDeleteLeague(req: Request, res: Response) {
  if (!requireLeaguePermission(req, res)) return;
  const { id } = req.params;
  db.deleteMyLeague(id);
  res.json({ success: true });
}

export function handleGetLeaguePermissions(req: Request, res: Response) {
  res.json({ permissions: db.getLeaguePermissions() });
}

export function handleToggleLeaguePermission(req: Request, res: Response) {
  const { targetUserId } = req.body;
  if (!targetUserId) {
    return res.status(400).json({ error: 'Thiếu mã tài khoản!' });
  }
  const perms = db.getLeaguePermissions();
  const nextPerms = { ...perms, [targetUserId]: !perms[targetUserId] };
  db.saveLeaguePermissions(nextPerms);
  res.json({ success: true, permissions: nextPerms });
}