ALTER TABLE comment_threads ADD COLUMN resolved INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_comment_threads_doc_resolved ON comment_threads(document_id, resolved);
