ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN two_factor_secret TEXT;

CREATE TABLE IF NOT EXISTS backup_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  code TEXT,
  used INTEGER DEFAULT 0,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_backup_user ON backup_codes(user_id);
