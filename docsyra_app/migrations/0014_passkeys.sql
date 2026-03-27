CREATE TABLE IF NOT EXISTS passkeys (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  credential_id TEXT,
  public_key TEXT,
  counter INTEGER,
  transports TEXT,
  created_at INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_passkeys_user ON passkeys(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_passkeys_credential_id ON passkeys(credential_id);
