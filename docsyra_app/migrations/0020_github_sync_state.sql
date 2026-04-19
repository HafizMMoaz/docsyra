ALTER TABLE documents ADD COLUMN last_github_sha TEXT;
ALTER TABLE documents ADD COLUMN last_synced_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_documents_last_synced_at ON documents(last_synced_at);
