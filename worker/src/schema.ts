import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

export const usersTable = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').unique().notNull(),
  email: text('email'),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  avatar: text('avatar').notNull(),
  role: text('role').$type<'admin' | 'user'>().notNull(),
  otp: text('otp'),
  otpExpires: integer('otp_expires'),
  otpAttempts: integer('otp_attempts').default(0),
  lastOtpAt: integer('last_otp_at').default(0),
  isGoogleUser: integer('is_google_user'),
  emailVerified: integer('email_verified').default(0),
  createdAt: integer('created_at').notNull().default(0),
});

export const dailyCountersTable = sqliteTable('daily_counters', {
  date: text('date').primaryKey(),
  otpSends: integer('otp_sends').notNull().default(0),
});

export const profilesTable = sqliteTable('profiles', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  avatar: text('avatar').notNull(),
  eloCaro: integer('elo_caro').default(1500),
  eloCoTuong: integer('elo_co_tuong').default(1500),
  eloCoVua: integer('elo_co_vua').default(1500),
  eloOAnQuan: integer('elo_o_an_quan').default(1500),
  eloCoCaNgua: integer('elo_co_ca_ngua').default(1500),
  eloDuoiHinhBatChu: integer('elo_duoi_hinh_bat_chu').default(1500),
  eloNoiChu: integer('elo_noi_chu').default(1500),
  eloDoanTu: integer('elo_doan_tu').default(1500),
  honorScore: integer('honor_score').default(100),
  badges: text('badges').notNull(),
});

export const matchesTable = sqliteTable('matches', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull(),
  status: text('status').notNull(),
  players: text('players').notNull(),
  boardState: text('board_state'),
  turn: text('turn').notNull(),
  moves: text('moves').notNull(),
  viewers: text('viewers').notNull(),
  winner: text('winner'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  privateCode: text('private_code'),
});

export const tournamentsTable = sqliteTable('tournaments', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  gameId: text('game_id').notNull(),
  status: text('status').notNull(),
  organizer: text('organizer').notNull(),
  players: text('players').notNull(),
  maxPlayers: integer('max_players').notNull(),
  deadline: integer('deadline').notNull(),
  schedule: text('schedule').notNull(),
  standings: text('standings').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const dailyChallengesTable = sqliteTable('daily_challenges', {
  id: text('id').notNull(),
  date: text('date').notNull(),
  gameId: text('game_id').notNull(),
  seed: text('seed').notNull(),
  prompt: text('prompt').notNull(),
  topScores: text('top_scores').notNull(),
}, (table) => ({
  // One challenge per (date, game) — not one per date across all games.
  pk: primaryKey({ columns: [table.date, table.gameId] }),
}));

export const bilacPlayersTable = sqliteTable('bilac_players', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  avatar: text('avatar').notNull(),
  tournamentId: text('tournament_id'),
});

export const bilacMatchesTable = sqliteTable('bilac_matches', {
  id: text('id').primaryKey(),
  timestamp: integer('timestamp').notNull(),
  weekLabel: text('week_label').notNull(),
  team1: text('team1').notNull(),
  team2: text('team2').notNull(),
  score1: integer('score1').notNull(),
  score2: integer('score2').notNull(),
  status: text('status').notNull(),
  benched: text('benched'),
  tournamentId: text('tournament_id'),
});

export const bilacTournamentsTable = sqliteTable('bilac_tournaments', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  description: text('description'),
  createdAt: integer('created_at').notNull(),
});

export const bilacTournamentMembersTable = sqliteTable('bilac_tournament_members', {
  id: text('id').primaryKey(),
  tournamentId: text('tournament_id').notNull(),
  userId: text('user_id').notNull(),
  username: text('username').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role').notNull(), // 'owner' | 'member'
  joinedAt: integer('joined_at').notNull(),
});

export const myLeaguesTable = sqliteTable('my_leagues', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sport: text('sport').notNull(),
  format: text('format').notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
  teams: text('teams').notNull(),
  matches: text('matches').notNull(),
});

export const leaguePermissionsTable = sqliteTable('league_permissions', {
  userId: text('user_id').primaryKey(),
  canEdit: integer('can_edit').default(0),
});
