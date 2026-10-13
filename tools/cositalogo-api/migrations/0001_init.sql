CREATE TABLE titles (
  type TEXT NOT NULL CHECK (type IN ('movie', 'series')),
  tmdb_id INTEGER NOT NULL CHECK (tmdb_id > 0),
  imdb TEXT,
  title TEXT NOT NULL,
  original_title TEXT,
  english_title TEXT,
  year TEXT,
  tmdb_poster TEXT,
  poster TEXT,
  genres TEXT NOT NULL DEFAULT '[]',
  seasons TEXT NOT NULL DEFAULT '{}',
  season_posters TEXT NOT NULL DEFAULT '{}',
  detail TEXT NOT NULL DEFAULT '{}',
  json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (type, tmdb_id)
);

CREATE TABLE links (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  tmdb_id INTEGER NOT NULL,
  season TEXT,
  quality TEXT NOT NULL,
  audio TEXT NOT NULL DEFAULT '[]',
  subs TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  url TEXT NOT NULL,
  link_key TEXT NOT NULL UNIQUE,
  added_by INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (type, tmdb_id) REFERENCES titles (type, tmdb_id)
);

CREATE INDEX links_by_title ON links (type, tmdb_id);

CREATE TABLE admins (
  user_id INTEGER PRIMARY KEY,
  name TEXT,
  added_by INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE audit (
  id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  before TEXT,
  after TEXT
);

CREATE INDEX audit_by_time ON audit (at);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL,
  body TEXT NOT NULL
);

INSERT INTO snapshot (id, version, body) VALUES (1, 0, '[]');
