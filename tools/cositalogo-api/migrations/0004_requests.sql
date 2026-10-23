CREATE TABLE requests (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('movie', 'series')),
  tmdb_id INTEGER NOT NULL CHECK (tmdb_id > 0),
  season INTEGER CHECK (season IS NULL OR (type = 'series' AND season >= 0)),
  title TEXT NOT NULL,
  season_name TEXT,
  year TEXT,
  poster TEXT,
  note TEXT,
  requested_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX requests_by_title ON requests (type, tmdb_id);

CREATE TABLE request_votes (
  request_id INTEGER NOT NULL REFERENCES requests (id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (request_id, user_id)
);
