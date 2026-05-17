CREATE TABLE user_ai_settings (
  user_id TEXT PRIMARY KEY,
  ai_provider TEXT NOT NULL DEFAULT 'anthropic',
  anthropic_api_key TEXT,
  anthropic_model TEXT,
  openai_api_key TEXT,
  openai_model TEXT,
  groq_api_key TEXT,
  groq_model TEXT,
  gemini_api_key TEXT,
  gemini_model TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
