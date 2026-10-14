-- Migration number: 0001 	 2026-10-14T19:26:57.593Z
-- Times are Unix seconds in UTC; score days are YYYY-MM-DD in UTC.
-- JSON snapshots are serialized by the server. Test cases must contain only
-- masked text and neutral player stand-ins, with no FK to expiring game rows.
CREATE TABLE players (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_played_at INTEGER NOT NULL,
  reviewer_standing TEXT NOT NULL DEFAULT 'good'
    CHECK (reviewer_standing IN ('good', 'excluded'))
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY NOT NULL,
  author_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  masked_text TEXT NOT NULL,
  context_message_ids TEXT NOT NULL CHECK (json_valid(context_message_ids) AND json_type(context_message_ids) = 'array'),
  filter_scores TEXT NOT NULL CHECK (json_valid(filter_scores) AND json_type(filter_scores) = 'object'),
  filter_version TEXT NOT NULL,
  filter_outcome TEXT NOT NULL CHECK (filter_outcome IN ('passed', 'blocked', 'off_limits')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'slip', 'clean', 'caught', 'false_positive', 'excluded')),
  top_score REAL NOT NULL CHECK (top_score >= 0 AND top_score <= 1),
  created_at INTEGER NOT NULL
);

-- A verdict changes status, never the original filter decision.
CREATE TRIGGER messages_filter_outcome_immutable
BEFORE UPDATE OF filter_outcome ON messages
WHEN NEW.filter_outcome <> OLD.filter_outcome
BEGIN
  SELECT RAISE(ABORT, 'filter_outcome is immutable');
END;

CREATE TABLE test_cases (
  id TEXT PRIMARY KEY NOT NULL,
  message TEXT NOT NULL,
  context_snapshot TEXT NOT NULL CHECK (json_valid(context_snapshot) AND json_type(context_snapshot) = 'array'),
  expected_verdict TEXT NOT NULL CHECK (expected_verdict IN ('fine', 'not_ok')),
  rule TEXT,
  reasons TEXT NOT NULL CHECK (json_valid(reasons) AND json_type(reasons) = 'array'),
  source TEXT NOT NULL CHECK (source IN ('game', 'seed')),
  version_added TEXT NOT NULL
);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY NOT NULL,
  message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
  seed_case_id TEXT REFERENCES test_cases(id),
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  verdict TEXT CHECK (verdict IN ('fine', 'not_ok')),
  rule TEXT,
  reason TEXT,
  skipped INTEGER NOT NULL DEFAULT 0 CHECK (skipped IN (0, 1)),
  seed_correct INTEGER CHECK (seed_correct IN (0, 1)),
  assignment TEXT NOT NULL CHECK (assignment IN ('queue', 'hand_picked')),
  created_at INTEGER NOT NULL,
  CHECK ((message_id IS NOT NULL) + (seed_case_id IS NOT NULL) = 1),
  CHECK (seed_case_id IS NOT NULL OR seed_correct IS NULL),
  CHECK ((skipped = 1 AND verdict IS NULL AND seed_correct IS NULL)
    OR (skipped = 0 AND verdict IS NOT NULL)),
  UNIQUE (player_id, message_id)
);

-- A known-answer review must target a seed, not a game-derived test case.
CREATE TRIGGER reviews_seed_source_insert
BEFORE INSERT ON reviews
WHEN NEW.seed_case_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM test_cases WHERE id = NEW.seed_case_id AND source = 'seed')
BEGIN
  SELECT RAISE(ABORT, 'seed_case_id must reference a seed');
END;

CREATE TRIGGER reviews_seed_source_update
BEFORE UPDATE OF seed_case_id ON reviews
WHEN NEW.seed_case_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM test_cases WHERE id = NEW.seed_case_id AND source = 'seed')
BEGIN
  SELECT RAISE(ABORT, 'seed_case_id must reference a seed');
END;

CREATE TABLE scores (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  slips INTEGER NOT NULL DEFAULT 0 CHECK (slips >= 0),
  PRIMARY KEY (player_id, day)
);

-- Feed: newest passed messages, including censored slips; never excluded rows.
CREATE INDEX messages_feed ON messages(created_at DESC, id)
  WHERE filter_outcome = 'passed' AND status <> 'excluded';
-- Queue ordering and pending lookup (#15 owns assignment reservations).
CREATE INDEX messages_queue ON messages(status, top_score DESC, created_at, id);
CREATE INDEX reviews_message ON reviews(message_id);
CREATE INDEX reviews_player_seed ON reviews(player_id, seed_case_id, created_at DESC);
-- Recent seed checks across all seed cases, used to recompute standing.
CREATE INDEX reviews_recent_seed ON reviews(player_id, created_at DESC)
  WHERE seed_case_id IS NOT NULL;
-- Retention and the rolling 90-day board.
CREATE INDEX players_retention ON players(last_played_at);
CREATE INDEX messages_retention ON messages(created_at);
CREATE INDEX messages_author ON messages(author_id);
CREATE INDEX reviews_retention ON reviews(created_at);
CREATE INDEX scores_board ON scores(day, player_id, slips);
