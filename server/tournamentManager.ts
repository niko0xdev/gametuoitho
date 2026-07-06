import { db } from './db.ts';
import { Tournament, TournamentMatch, MatchState } from '../src/types.ts';
import { roomManager } from './roomManager.ts';

class TournamentManager {
  private tournamentCodes = new Map<string, string>(); // Code to Tournament ID

  constructor() {
    // Restore any existing code maps on boot
    const tournaments = db.getAllTournaments();
    tournaments.forEach(t => {
      const code = t.id.substring(2, 8).toUpperCase(); // Simple deterministic code
      this.tournamentCodes.set(code, t.id);
    });
  }

  createTournament(
    userId: string,
    name: string,
    gameId: string,
    maxPlayers: number,
    deadlineSeconds: number
  ): Tournament {
    const id = `t_${Math.random().toString(36).substring(2, 10)}`;
    const code = id.substring(2, 8).toUpperCase();

    const tournament: Tournament = {
      id,
      name,
      gameId,
      status: 'REGISTRATION',
      organizer: userId,
      players: [userId], // Organizer is automatically joined
      maxPlayers,
      deadline: Date.now() + (deadlineSeconds * 1000),
      schedule: [],
      standings: { [userId]: 0 },
      createdAt: Date.now()
    };

    db.saveTournament(tournament);
    this.tournamentCodes.set(code, id);

    console.log(`Tournament ${name} (Code: ${code}) created by ${userId}`);
    return tournament;
  }

  joinTournament(userId: string, code: string): Tournament | null {
    const cleanCode = code.trim().toUpperCase();
    const tId = this.tournamentCodes.get(cleanCode);
    if (!tId) return null;

    const t = db.getTournament(tId);
    if (!t || t.status !== 'REGISTRATION') return null;

    if (t.players.includes(userId)) {
      return t; // Already joined
    }

    if (t.players.length >= t.maxPlayers) {
      return null; // Full
    }

    t.players.push(userId);
    t.standings[userId] = 0;
    db.saveTournament(t);

    console.log(`Player ${userId} joined tournament ${t.name} (Code: ${cleanCode})`);
    return t;
  }

  startTournament(tournamentId: string): Tournament | null {
    const t = db.getTournament(tournamentId);
    if (!t || t.status !== 'REGISTRATION') return null;

    t.status = 'ACTIVE';

    // Generate Round-Robin schedule (every player plays everyone else exactly once)
    const schedule: TournamentMatch[] = [];
    const players = t.players;

    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        schedule.push({
          matchId: `tm_${t.id}_${i}_${j}`,
          player1: players[i],
          player2: players[j],
          status: 'WAITING'
        });
      }
    }

    t.schedule = schedule;
    db.saveTournament(t);

    console.log(`Tournament ${t.name} has started! Generated ${schedule.length} matches.`);
    return t;
  }

  // Launch a scheduled tournament match
  launchTournamentMatch(tournamentId: string, matchIndex: number): string | null {
    const t = db.getTournament(tournamentId);
    if (!t || t.status !== 'ACTIVE') return null;

    const matchInfo = t.schedule[matchIndex];
    if (!matchInfo || matchInfo.status !== 'WAITING') return null;

    // Trigger match creation in RoomManager
    const realMatchId = roomManager.startMatch(t.gameId, [matchInfo.player1, matchInfo.player2]);

    // Update index references so that the tournament knows which active match represents this pairing
    matchInfo.matchId = realMatchId;
    matchInfo.status = 'PLAYING';

    db.saveTournament(t);
    return realMatchId;
  }

  // Handle completed match results
  reportMatchResult(matchId: string, winner?: string) {
    // Find if this match belongs to an active tournament
    const tournaments = db.getAllTournaments().filter(t => t.status === 'ACTIVE');

    for (const t of tournaments) {
      const matchIndex = t.schedule.findIndex(m => m.matchId === matchId);
      if (matchIndex !== -1) {
        const m = t.schedule[matchIndex];
        m.status = 'ENDED';
        m.winner = winner;

        // Scoring rules: Win = 3, Draw = 1, Loss = 0
        if (winner === 'DRAW') {
          t.standings[m.player1] = (t.standings[m.player1] || 0) + 1;
          t.standings[m.player2] = (t.standings[m.player2] || 0) + 1;
        } else if (winner) {
          const loser = m.player1 === winner ? m.player2 : m.player1;
          t.standings[winner] = (t.standings[winner] || 0) + 3;
          t.standings[loser] = (t.standings[loser] || 0) + 0;
        }

        // Check if all tournament matches completed
        const allCompleted = t.schedule.every(match => match.status === 'ENDED');
        if (allCompleted) {
          t.status = 'ENDED';
          console.log(`Tournament ${t.name} has concluded!`);
        }

        db.saveTournament(t);
        break;
      }
    }
  }

  cancelTournament(tournamentId: string, userId: string): boolean {
    const t = db.getTournament(tournamentId);
    if (!t || t.status !== 'REGISTRATION' || t.organizer !== userId) return false;

    // Delete tournament
    const tournaments = db.getAllTournaments().filter(tour => tour.id !== tournamentId);
    const newDbData = {
      ...(db as any).data,
      tournaments: tournaments.reduce((acc, tour) => ({ ...acc, [tour.id]: tour }), {})
    };
    (db as any).data = newDbData;
    db.saveTournament(t); // Writes current data state

    // Clean code mapping
    const code = tournamentId.substring(2, 8).toUpperCase();
    this.tournamentCodes.delete(code);

    console.log(`Tournament ${tournamentId} cancelled by organizer ${userId}`);
    return true;
  }

  getTournamentByCode(code: string): Tournament | undefined {
    const id = this.tournamentCodes.get(code.trim().toUpperCase());
    return id ? db.getTournament(id) : undefined;
  }
}

export const tournamentManager = new TournamentManager();
export default tournamentManager;
