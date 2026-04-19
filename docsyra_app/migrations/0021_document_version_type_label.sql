ALTER TABLE document_versions ADD COLUMN type TEXT DEFAULT 'auto';
ALTER TABLE document_versions ADD COLUMN label TEXT;