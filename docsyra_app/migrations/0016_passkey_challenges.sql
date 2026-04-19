CREATE TABLE passkey_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  challenge TEXT,
  expires_at INTEGER
);

CREATE INDEX idx_passkey_challenge_user ON passkey_challenges(user_id);
