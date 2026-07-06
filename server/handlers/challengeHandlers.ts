import type { Request, Response } from 'express';
import { dailyChallengeManager } from '../dailyChallengeManager.ts';

export function handleGetChallenge(req: Request, res: Response) {
  const challenge = dailyChallengeManager.getOrCreateChallenge(req.params.gameId, req.params.date);
  res.json(challenge);
}

export function handleSubmitChallenge(req: Request, res: Response) {
  const { userId, displayName, avatar, score } = req.body;
  const challenge = dailyChallengeManager.submitScore(
    req.params.gameId,
    req.params.date,
    userId,
    displayName,
    avatar,
    score
  );
  res.json(challenge);
}