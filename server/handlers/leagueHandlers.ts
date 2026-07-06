import type { Request, Response } from 'express';
import { db } from '../db.ts';

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
  const league = req.body;
  if (!league || !league.id || !league.name) {
    return res.status(400).json({ error: 'Dữ liệu giải đấu không hợp lệ!' });
  }
  db.saveMyLeague(league);
  res.json(league);
}

export function handlePutLeague(req: Request, res: Response) {
  const league = req.body;
  if (!league || !league.id || !league.name) {
    return res.status(400).json({ error: 'Dữ liệu giải đấu không hợp lệ!' });
  }
  db.saveMyLeague(league);
  res.json(league);
}

export function handleDeleteLeague(req: Request, res: Response) {
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