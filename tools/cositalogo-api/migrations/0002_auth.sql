CREATE TABLE members (
  user_id INTEGER PRIMARY KEY,
  name TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE login_requests (
  nonce TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  user_id INTEGER,
  name TEXT
);

CREATE INDEX login_requests_by_expiry ON login_requests (expires_at);

CREATE TABLE password_failures (
  user_id INTEGER NOT NULL,
  at INTEGER NOT NULL
);

CREATE INDEX password_failures_by_user ON password_failures (user_id, at);
