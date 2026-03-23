ALTER TABLE users ADD COLUMN name TEXT;
ALTER TABLE users ADD COLUMN avatar_url TEXT;

ALTER TABLE auth_identities ADD COLUMN name TEXT;
ALTER TABLE auth_identities ADD COLUMN avatar_url TEXT;
