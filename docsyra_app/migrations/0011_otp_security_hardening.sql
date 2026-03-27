ALTER TABLE email_otp_codes ADD COLUMN code_hash TEXT;
ALTER TABLE email_otp_codes ADD COLUMN created_at INTEGER;

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER,
  count INTEGER
);
