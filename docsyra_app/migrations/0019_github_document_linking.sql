ALTER TABLE documents ADD COLUMN github_repo TEXT;
ALTER TABLE documents ADD COLUMN github_branch TEXT DEFAULT 'main';
ALTER TABLE documents ADD COLUMN github_path TEXT;

ALTER TABLE auth_identities ADD COLUMN access_token TEXT;

CREATE INDEX IF NOT EXISTS idx_documents_github_repo ON documents(github_repo);
