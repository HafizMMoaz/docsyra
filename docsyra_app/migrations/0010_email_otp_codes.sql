CREATE TABLE IF NOT EXISTS email_otp_codes (
  id TEXT PRIMARY KEY,
  email TEXT,
  code TEXT,
  expires_at INTEGER,
  attempts INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_otp_email ON email_otp_codes(email);
