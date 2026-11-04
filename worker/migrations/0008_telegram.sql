CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_hash TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE telegram_links (
  telegram_id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE telegram_tokens (
  hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tournament_id TEXT, purpose TEXT NOT NULL, expires_at INTEGER NOT NULL,
  telegram_id TEXT, chat_id TEXT, chat_title TEXT
);
CREATE TABLE bilac_telegram (
  tournament_id TEXT PRIMARY KEY REFERENCES bilac_tournaments(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL UNIQUE, chat_title TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
  auto_post INTEGER NOT NULL DEFAULT 1, health TEXT, connected_by TEXT NOT NULL
);
CREATE TABLE telegram_updates (
  id INTEGER PRIMARY KEY, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  lease_until INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE telegram_drafts (
  id TEXT PRIMARY KEY, tournament_id TEXT NOT NULL, chat_id TEXT NOT NULL, telegram_id TEXT NOT NULL,
  kind TEXT NOT NULL, payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL, consumed INTEGER NOT NULL DEFAULT 0, decision TEXT
);
CREATE TABLE telegram_outbox (
  id TEXT PRIMARY KEY, tournament_id TEXT, chat_id TEXT NOT NULL, payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
  due_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, message_id INTEGER, error TEXT
);
CREATE INDEX telegram_outbox_due ON telegram_outbox(status, due_at);
CREATE TABLE bilac_telegram_audit (
  operation_id TEXT PRIMARY KEY, tournament_id TEXT NOT NULL, match_id TEXT NOT NULL,
  user_id TEXT NOT NULL, before_json TEXT, after_json TEXT NOT NULL, created_at INTEGER NOT NULL
);
ALTER TABLE bilac_matches ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
CREATE TRIGGER bilac_match_revision AFTER UPDATE ON bilac_matches
WHEN NEW.revision = OLD.revision
BEGIN
  UPDATE bilac_matches SET revision = OLD.revision + 1 WHERE id = NEW.id;
END;
