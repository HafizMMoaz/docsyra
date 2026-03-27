CREATE UNIQUE INDEX IF NOT EXISTS uq_email_verification_tokens_token ON email_verification_tokens(token);
CREATE UNIQUE INDEX IF NOT EXISTS uq_password_reset_tokens_token ON password_reset_tokens(token);
