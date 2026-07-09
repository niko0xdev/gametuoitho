-- Sports league (MyLeague) per-league ACL + share link.
-- Mirrors the Bi Lắc model: a public 8-char slug for the view-only deep-link,
-- a secret `code` passcode that gates viewing, and a members table (owner|admin)
-- that is the single source of edit authority.

ALTER TABLE my_leagues ADD COLUMN slug TEXT;
ALTER TABLE my_leagues ADD COLUMN code TEXT;
ALTER TABLE my_leagues ADD COLUMN description TEXT;
ALTER TABLE my_leagues ADD COLUMN owner_user_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_my_leagues_slug ON my_leagues(slug) WHERE slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS my_league_members (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  joined_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_my_league_members_league ON my_league_members(league_id);
CREATE INDEX IF NOT EXISTS idx_my_league_members_user ON my_league_members(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_my_league_members_unique ON my_league_members(league_id, user_id);
