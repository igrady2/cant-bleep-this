-- Migration number: 0005 	 2026-10-15T19:15:00.000Z
-- Server-owned review assignments (#15): opaque id, player, expiry, single-use consume (#16).
CREATE TABLE review_assignments (
  id TEXT PRIMARY KEY NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
  seed_case_id TEXT REFERENCES test_cases(id),
  assignment TEXT NOT NULL CHECK (assignment IN ('queue', 'hand_picked')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  CHECK ((message_id IS NOT NULL) + (seed_case_id IS NOT NULL) = 1),
  CHECK (assignment <> 'hand_picked' OR message_id IS NOT NULL)
);

-- At most one active hand-picked assignment per message (expired rows released before insert).
CREATE UNIQUE INDEX review_assignments_hand_picked_slot
  ON review_assignments(message_id)
  WHERE assignment = 'hand_picked' AND consumed_at IS NULL;

CREATE INDEX review_assignments_player_open
  ON review_assignments(player_id, expires_at)
  WHERE consumed_at IS NULL;

CREATE INDEX review_assignments_expires
  ON review_assignments(expires_at)
  WHERE consumed_at IS NULL;

-- Queue candidate scan: pending, non-author, not yet reviewed by this player.
CREATE INDEX messages_review_queue_scan
  ON messages(status, author_id, created_at, id)
  WHERE filter_outcome IN ('passed', 'blocked') AND status = 'pending';
