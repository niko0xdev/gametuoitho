ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN otp_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN last_otp_at INTEGER DEFAULT 0;
-- Existing users (created before this feature) are grandfathered as verified
-- so they aren't locked out of login. New signups explicitly set email_verified=0.
UPDATE users SET email_verified = 1 WHERE email_verified = 0;
