-- Global daily OTP-send counter: bounds total Resend usage/day so a
-- distributed signup-spam attack can't burn the free quota (100/day).
CREATE TABLE IF NOT EXISTS daily_counters (
  date TEXT PRIMARY KEY,
  otp_sends INTEGER NOT NULL DEFAULT 0
);

-- Account creation timestamp, used by the prune cron to delete unverified
-- accounts older than 24h (anti D1 bloat from signup spam).
ALTER TABLE users ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;

-- Grandfather existing rows as "now" so the prune job never touches them.
UPDATE users SET created_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE created_at = 0;
