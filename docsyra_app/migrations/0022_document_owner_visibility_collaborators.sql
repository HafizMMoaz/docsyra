-- Add new ownership fields
ALTER TABLE documents ADD COLUMN owner_id TEXT;
ALTER TABLE documents ADD COLUMN visibility TEXT DEFAULT 'private';

-- Migrate all data from user_id to owner_id
UPDATE documents
SET owner_id = user_id
WHERE owner_id IS NULL;

-- CRITICAL: Drop legacy user_id field to prevent dual-ownership bugs
ALTER TABLE documents DROP COLUMN user_id;

-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_documents_owner_id ON documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_visibility ON documents(visibility);
CREATE INDEX IF NOT EXISTS idx_collab_doc_user ON document_collaborators(document_id, user_id);
CREATE INDEX IF NOT EXISTS idx_collab_user_id ON document_collaborators(user_id);
