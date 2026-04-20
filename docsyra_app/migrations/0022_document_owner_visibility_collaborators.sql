ALTER TABLE documents ADD COLUMN owner_id TEXT;

UPDATE documents
SET owner_id = user_id
WHERE owner_id IS NULL;

-- Keep legacy user_id for now; app code reads owner_id and this migration must stay D1-safe.
CREATE INDEX IF NOT EXISTS idx_documents_owner_id ON documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_visibility ON documents(visibility);
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at);
CREATE INDEX IF NOT EXISTS idx_documents_github_repo ON documents(github_repo);
CREATE INDEX IF NOT EXISTS idx_documents_last_synced_at ON documents(last_synced_at);
CREATE INDEX IF NOT EXISTS idx_collab_doc_user ON document_collaborators(document_id, user_id);
CREATE INDEX IF NOT EXISTS idx_collab_user_id ON document_collaborators(user_id);
