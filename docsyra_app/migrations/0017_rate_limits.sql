CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT,
  route TEXT,
  count INTEGER,
  window_start INTEGER,
  PRIMARY KEY (key, route)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON rate_limits(key);
