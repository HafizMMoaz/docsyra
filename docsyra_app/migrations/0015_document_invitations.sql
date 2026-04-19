CREATE TABLE IF NOT EXISTS document_invitations (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  invitee_email TEXT NOT NULL,
  invitee_user_id TEXT,
  invited_by_user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  accepted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(document_id) REFERENCES documents(id),
  FOREIGN KEY(invitee_user_id) REFERENCES users(id),
  FOREIGN KEY(invited_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_doc_inv_doc ON document_invitations(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_inv_email ON document_invitations(invitee_email);
CREATE INDEX IF NOT EXISTS idx_doc_inv_inviter ON document_invitations(invited_by_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_inv_doc_email_unique ON document_invitations(document_id, invitee_email);
