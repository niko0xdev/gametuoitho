import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

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
  isGoogleUser: integer('is_google_user'), // 1 = true, 0 = false
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
  badges: text('badges').notNull(), // JSON string array
});

export const matchesTable = sqliteTable('matches', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull(),
  status: text('status').notNull(),
  players: text('players').notNull(), // JSON string array
  boardState: text('board_state'), // JSON string
  turn: text('turn').notNull(),
  moves: text('moves').notNull(), // JSON string array
  viewers: text('viewers').notNull(), // JSON string array
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
  players: text('players').notNull(), // JSON string array
  maxPlayers: integer('max_players').notNull(),
  deadline: integer('deadline').notNull(),
  schedule: text('schedule').notNull(), // JSON string array
  standings: text('standings').notNull(), // JSON string record
  createdAt: integer('created_at').notNull(),
});

export const dailyChallengesTable = sqliteTable('daily_challenges', {
  id: text('id').notNull(),
  date: text('date').primaryKey(), // YYYY-MM-DD
  gameId: text('game_id').notNull(),
  seed: text('seed').notNull(),
  prompt: text('prompt').notNull(),
  topScores: text('top_scores').notNull(), // JSON string array of scores
});

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
  team1: text('team1').notNull(), // JSON string array
  team2: text('team2').notNull(), // JSON string array
  score1: integer('score1').notNull(),
  score2: integer('score2').notNull(),
  status: text('status').notNull(),
  benched: text('benched'),
  tournamentId: text('tournament_id'),
});

export const bilacTournamentsTable = sqliteTable('bilac_tournaments', {
  id: text('id').primaryKey(),
  slug: text('slug'),
  name: text('name').notNull(),
  code: text('code').notNull(),
  description: text('description'),
  createdAt: integer('created_at').notNull(),
  ownerUserId: text('owner_user_id'), // userId của người tạo giải
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
  createdAt: text('created_at').notNull(), // ISO string
  teams: text('teams').notNull(), // JSON string array of LeagueTeam
  matches: text('matches').notNull(), // JSON string array of LeagueMatch
});

export const leaguePermissionsTable = sqliteTable('league_permissions', {
  userId: text('user_id').primaryKey(),
  canEdit: integer('can_edit').default(0), // 1 = true, 0 = false
});
