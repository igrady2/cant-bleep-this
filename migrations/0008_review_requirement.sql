-- Migration number: 0008 	 2026-10-15T22:54:01.076Z
-- Durable progress avoids same-second timestamp ambiguity and concurrent post bypasses.
-- Existing players start with a fresh allowance when this feature is enabled.
CREATE TABLE player_review_progress (
  player_id TEXT PRIMARY KEY NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  posts_since_review INTEGER NOT NULL DEFAULT 0
    CONSTRAINT review_requirement_nonnegative CHECK (posts_since_review >= 0)
);
