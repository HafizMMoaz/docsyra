CREATE TABLE comment_threads (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  selection_from INTEGER NOT NULL,
  selection_to INTEGER NOT NULL,
  selection_text TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_comment_threads_doc ON comment_threads(document_id);
CREATE INDEX idx_comments_thread ON comments(thread_id);
