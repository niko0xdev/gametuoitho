CREATE TABLE IF NOT EXISTS bilac_tournament_members (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  joined_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bilac_members_tournament ON bilac_tournament_members(tournament_id);
