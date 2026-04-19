CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  thread_id TEXT,
  comment_id TEXT,
  type TEXT NOT NULL,
  mention_token TEXT,
  message TEXT NOT NULL,
  read_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, read_at);
CREATE INDEX idx_notifications_document ON notifications(document_id, created_at DESC);
