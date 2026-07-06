CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar TEXT NOT NULL,
  role TEXT NOT NULL,
  otp TEXT,
  otp_expires INTEGER,
  is_google_user INTEGER
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar TEXT NOT NULL,
  elo_caro INTEGER DEFAULT 1500,
  elo_co_tuong INTEGER DEFAULT 1500,
  elo_co_vua INTEGER DEFAULT 1500,
  elo_o_an_quan INTEGER DEFAULT 1500,
  elo_co_ca_ngua INTEGER DEFAULT 1500,
  elo_duoi_hinh_bat_chu INTEGER DEFAULT 1500,
  elo_noi_chu INTEGER DEFAULT 1500,
  elo_doan_tu INTEGER DEFAULT 1500,
  honor_score INTEGER DEFAULT 100,
  badges TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  status TEXT NOT NULL,
  players TEXT NOT NULL,
  board_state TEXT,
  turn TEXT NOT NULL,
  moves TEXT NOT NULL,
  viewers TEXT NOT NULL,
  winner TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  private_code TEXT
);

CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  game_id TEXT NOT NULL,
  status TEXT NOT NULL,
  organizer TEXT NOT NULL,
  players TEXT NOT NULL,
  max_players INTEGER NOT NULL,
  deadline INTEGER NOT NULL,
  schedule TEXT NOT NULL,
  standings TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_challenges (
  id TEXT NOT NULL,
  date TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  seed TEXT NOT NULL,
  prompt TEXT NOT NULL,
  top_scores TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bilac_players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL,
  tournament_id TEXT
);

CREATE TABLE IF NOT EXISTS bilac_matches (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  week_label TEXT NOT NULL,
  team1 TEXT NOT NULL,
  team2 TEXT NOT NULL,
  score1 INTEGER NOT NULL,
  score2 INTEGER NOT NULL,
  status TEXT NOT NULL,
  benched TEXT,
  tournament_id TEXT
);

CREATE TABLE IF NOT EXISTS bilac_tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS my_leagues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sport TEXT NOT NULL,
  format TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  teams TEXT NOT NULL,
  matches TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS league_permissions (
  user_id TEXT PRIMARY KEY,
  can_edit INTEGER DEFAULT 0
);
