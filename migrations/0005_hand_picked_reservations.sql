-- Migration number: 0005 	 2026-10-15T19:15:00.000Z
-- At most one hand-picked deciding review per message (#15).
CREATE TABLE hand_picked_review_reservations (
  message_id TEXT PRIMARY KEY NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  reserved_at INTEGER NOT NULL
);
