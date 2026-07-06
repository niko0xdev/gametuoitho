import type { Request, Response } from 'express';
import { db } from '../db.ts';
import { tournamentManager } from '../tournamentManager.ts';

export function handleListTournaments(req: Request, res: Response) {
  res.json(db.getAllTournaments());
}

export function handleCreateTournament(req: Request, res: Response) {
  const { userId, name, gameId, maxPlayers, deadlineSeconds } = req.body;
  const tournament = tournamentManager.createTournament(
    userId,
    name,
    gameId,
    parseInt(maxPlayers) || 16,
    parseInt(deadlineSeconds) || 300
  );
  res.json(tournament);
}

export function handleJoinTournament(req: Request, res: Response) {
  const { userId, code } = req.body;
  const tournament = tournamentManager.joinTournament(userId, code);
  if (!tournament) {
    return res.status(400).json({ error: 'Không thể tham gia giải đấu! Giải đấu có thể đã đầy hoặc mã không hợp lệ.' });
  }
  res.json(tournament);
}

export function handleGetTournamentByCode(req: Request, res: Response) {
  const tournament = tournamentManager.getTournamentByCode(req.params.code);
  if (!tournament) {
    return res.status(404).json({ error: 'Không tìm thấy giải đấu!' });
  }
  res.json(tournament);
}

export function handleGetTournament(req: Request, res: Response) {
  const tournament = db.getTournament(req.params.id);
  if (!tournament) {
    return res.status(404).json({ error: 'Không tìm thấy giải đấu!' });
  }
  res.json(tournament);
}

export function handleStartTournament(req: Request, res: Response) {
  const tournament = tournamentManager.startTournament(req.params.id);
  if (!tournament) {
    return res.status(400).json({ error: 'Không thể bắt đầu giải đấu!' });
  }
  res.json(tournament);
}

export function handleLaunchTournamentMatch(req: Request, res: Response) {
  const matchId = tournamentManager.launchTournamentMatch(
    req.params.id,
    parseInt(req.params.matchIndex)
  );
  if (!matchId) {
    return res.status(400).json({ error: 'Không thể kích hoạt trận đấu này!' });
  }
  res.json({ matchId });
}