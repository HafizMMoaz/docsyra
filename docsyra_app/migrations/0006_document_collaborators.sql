CREATE TABLE IF NOT EXISTS document_collaborators (
  id TEXT PRIMARY KEY,
  document_id TEXT,
  user_id TEXT,
  role TEXT,
  created_at INTEGER,
  FOREIGN KEY(document_id) REFERENCES documents(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_collab_doc ON document_collaborators(document_id);
CREATE INDEX IF NOT EXISTS idx_collab_user ON document_collaborators(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_collab_doc_user_unique ON document_collaborators(document_id, user_id);
