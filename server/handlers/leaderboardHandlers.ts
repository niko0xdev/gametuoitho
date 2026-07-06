import type { Request, Response } from 'express';
import { db } from '../db.ts';

export function handleLeaderboardGlobal(req: Request, res: Response) {
  const profiles = db.getAllProfiles();
  const sorted = profiles
    .sort((a, b) => b.honorScore - a.honorScore)
    .slice(0, 50);
  res.json(sorted);
}

export function handleLeaderboardByGame(req: Request, res: Response) {
  const gameId = req.params.gameId;
  const profiles = db.getAllProfiles();
  const sorted = profiles
    .map(p => ({
      id: p.id,
      displayName: p.displayName,
      avatar: p.avatar,
      elo: p.elo[gameId] || 1500,
      honorScore: p.honorScore
    }))
    .sort((a, b) => b.elo - a.elo)
    .slice(0, 50);
  res.json(sorted);
}