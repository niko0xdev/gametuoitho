export interface UserProfile {
  id: string;
  displayName: string;
  avatar: string;
  elo?: Record<string, number>; // Game ID to Elo mapping (optional: bot/opponent profiles may omit)
  honorScore: number;
  badges: string[];
  role?: 'admin' | 'user';
  email?: string;
  username?: string;
}

export interface Game {
  id: string;
  name: string;
  category: 'strategy' | 'quiz' | 'puzzle' | 'memory' | 'math';
  description: string;
  isRealTime: boolean;
  minPlayers: number;
  maxPlayers: number;
}

export type MatchStatus = 'WAITING' | 'PLAYING' | 'ENDED';

export interface MatchMove {
  player: string;
  move: any;
  timestamp: number;
  sequence: number;
}

export interface MatchState {
  id: string;
  gameId: string;
  status: MatchStatus;
  players: string[]; // User IDs (seats)
  boardState: any; // Game-specific state
  turn: string; // User ID whose turn it is
  moves: MatchMove[];
  viewers: string[]; // User IDs of spectators
  winner?: string; // User ID of winner or "DRAW"
  createdAt: number;
  updatedAt: number;
  privateCode?: string; // If private room
}

export interface TournamentMatch {
  matchId: string;
  player1: string;
  player2: string;
  winner?: string;
  status: MatchStatus;
}

export interface Tournament {
  id: string;
  name: string;
  gameId: string;
  status: 'REGISTRATION' | 'ACTIVE' | 'ENDED';
  organizer: string;
  players: string[];
  maxPlayers: number;
  deadline: number;
  schedule: TournamentMatch[];
  standings: Record<string, number>; // User ID to points mapping (Win = 3, Draw = 1, Loss = 0)
  createdAt: number;
}

export interface DailyChallenge {
  id: string;
  date: string; // YYYY-MM-DD
  gameId: string;
  seed: string;
  prompt: string;
  topScores: { userId: string; displayName: string; avatar: string; score: number; timestamp: number }[];
}

export interface GameMessage {
  type: string;
  payload: any;
}

export interface BiLacPlayer {
  id: string;
  name: string;
  avatar: string;
  tournamentId?: string;
}

export interface BiLacMatch {
  id: string;
  timestamp: number;
  weekLabel: string;
  team1: string[];
  team2: string[];
  score1: number;
  score2: number;
  status: 'PLAYING' | 'FINISHED';
  benched?: string;
  tournamentId?: string;
}

export interface BiLacTournament {
  id: string;
  slug?: string;
  name: string;
  code: string;
  description?: string;
  createdAt: number;
}

// Sports League Management Types
export type SportType = 'futsal' | 'pes' | 'pingpong' | 'badminton';
export type FormatType = 'round_robin' | 'knockout' | 'group_knockout';

export interface LeagueTeam {
  id: string;
  name: string;
  logoColor: string;
  players?: string[]; // Player lineup/roster
}

export interface MatchEvent {
  type: 'goal' | 'yellow' | 'red';
  teamId: string;
  playerName: string;
  minute?: number;
}

export interface LeagueMatch {
  id: string;
  round: number;
  stage?: 'Group Stage' | 'Quarterfinals' | 'Semifinals' | 'Final';
  group?: 'A' | 'B';
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  isPlayed: boolean;
  winner?: string | null;
  nextMatchId?: string | null;
  nextMatchPosition?: 'home' | 'away' | null;
  events?: MatchEvent[]; // Match events (goals, cards)
}

export interface GroupStanding {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface MyLeague {
  id: string;
  name: string;
  sport: SportType;
  format: FormatType;
  teams: LeagueTeam[];
  matches: LeagueMatch[];
  status: 'PENDING' | 'ACTIVE' | 'ENDED';
  createdAt: string;
}

export interface ToastNotification {
  id: string;
  title: string;
  message: string;
  type: 'match' | 'invite' | 'info';
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

