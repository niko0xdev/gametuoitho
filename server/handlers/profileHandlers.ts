import type { Request, Response } from 'express';
import { db } from '../db.ts';
import { roomManager } from '../roomManager.ts';
import { requireLoggedIn } from './_middleware.ts';

export function handleGetProfile(req: Request, res: Response) {
  const profile = roomManager.getOrInitializeProfile(req.params.userId);
  const user = db.getUser(req.params.userId);
  res.json({ ...profile, role: user?.role || 'user' });
}

export function handleGetOnlineUsers(req: Request, res: Response) {
  const exclude = req.query.exclude as string;
  const list = roomManager.getOnlineUsers(exclude);
  res.json(list);
}

export function handleUpdateProfile(req: Request, res: Response) {
  const uid = requireLoggedIn(req, res);
  if (!uid) return;
  if (uid !== req.params.userId) {
    return res.status(403).json({ error: 'Bạn không có quyền sửa profile của người khác.' });
  }
  const { displayName, avatar } = req.body;
  const profile = roomManager.getOrInitializeProfile(req.params.userId);
  if (displayName) profile.displayName = displayName;
  if (avatar) profile.avatar = avatar;
  db.saveProfile(profile);

  const user = db.getUser(req.params.userId);
  if (user) {
    if (displayName) user.displayName = displayName;
    if (avatar) user.avatar = avatar;
    db.saveUser(user);
  }

  res.json({ ...profile, role: user?.role || 'user' });
}

export function handleResetElo(req: Request, res: Response) {
  const uid = requireLoggedIn(req, res);
  if (!uid) return;
  if (uid !== req.params.userId) {
    return res.status(403).json({ error: 'Bạn không có quyền đặt lại Elo của người khác.' });
  }
  const profile = roomManager.getOrInitializeProfile(req.params.userId);
  profile.elo = {
    caro: 1500,
    co_tuong: 1500,
    co_vua: 1500,
    o_an_quan: 1500,
    co_ca_ngua: 1500,
    duoi_hinh_bat_chu: 1500,
    noi_chu: 1500,
    doan_tu: 1500
  };
  db.saveProfile(profile);
  const user = db.getUser(req.params.userId);
  res.json({ ...profile, role: user?.role || 'user' });
}