import type { Request, Response } from 'express';
import { db } from '../db.ts';

export function handleGetReplaysByUser(req: Request, res: Response) {
  const userId = req.params.userId;
  const matches = db.getAllMatches().filter(
    m => m.status === 'ENDED' && m.players.includes(userId)
  );
  res.json(matches);
}

export function handleGetReplay(req: Request, res: Response) {
  const match = db.getMatch(req.params.matchId);
  if (!match) {
    return res.status(404).json({ error: 'Không tìm thấy nhật ký trận đấu!' });
  }
  res.json(match);
}