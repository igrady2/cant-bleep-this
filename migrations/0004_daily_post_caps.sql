-- Migration number: 0004 	 2026-10-15T18:30:00.000Z
-- Daily posting caps (#13): 20 per player and 2,000 site-wide (UTC day).
CREATE TABLE player_daily_posts (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  post_count INTEGER NOT NULL DEFAULT 0 CHECK (post_count >= 0 AND post_count <= 20),
  PRIMARY KEY (player_id, day)
);

CREATE TABLE site_daily_posts (
  day TEXT NOT NULL PRIMARY KEY,
  post_count INTEGER NOT NULL DEFAULT 0 CHECK (post_count >= 0 AND post_count <= 2000)
);
