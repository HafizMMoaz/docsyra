ALTER TABLE documents ADD COLUMN visibility TEXT DEFAULT 'private';

CREATE TABLE IF NOT EXISTS document_activity_logs (
  id TEXT PRIMARY KEY,
  document_id TEXT,
  user_id TEXT,
  action TEXT,
  created_at INTEGER,
  FOREIGN KEY(document_id) REFERENCES documents(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_logs_doc ON document_activity_logs(document_id);
CREATE INDEX IF NOT EXISTS idx_logs_user ON document_activity_logs(user_id);
