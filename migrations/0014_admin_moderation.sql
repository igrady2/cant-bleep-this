-- Migration number: 0014 	 2026-10-16T02:00:00.000Z
-- Admin message deletion and username bans (#24).

-- The UTC day a slip's point was awarded, so a maintainer deletion takes the
-- point back from the right score row. The award trigger stamps it in the same
-- step that writes the score, so both use the same 'now'.
ALTER TABLE messages ADD COLUMN slip_day TEXT
  CHECK (slip_day IS NULL OR slip_day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');

DROP TRIGGER IF EXISTS messages_award_slip;
CREATE TRIGGER messages_award_slip
AFTER UPDATE OF status ON messages
WHEN OLD.status = 'pending' AND NEW.status = 'slip'
  AND NEW.filter_outcome = 'passed'
BEGIN
  INSERT INTO scores (player_id, day, slips)
  VALUES (NEW.author_id, strftime('%Y-%m-%d', 'now'), 1)
  ON CONFLICT (player_id, day) DO UPDATE SET slips = slips + 1;
  UPDATE messages SET slip_day = strftime('%Y-%m-%d', 'now') WHERE id = NEW.id;
END;

-- Existing slips: the award ran right after the deciding review, so the latest
-- non-skipped review's day is the award day. Without reviews, the post day.
UPDATE messages SET slip_day = COALESCE(
  (SELECT strftime('%Y-%m-%d', MAX(r.created_at), 'unixepoch') FROM reviews r
    WHERE r.message_id = messages.id AND r.skipped = 0),
  strftime('%Y-%m-%d', created_at, 'unixepoch')
) WHERE status = 'slip' AND filter_outcome = 'passed';

-- Maintainer audit log. One row per effective action: the unique index makes a
-- repeated delete or ban a no-op instead of a second record. target_id is the
-- message or player id; no message text is stored. Like banned names, which are
-- never released, these rows are kept.
CREATE TABLE moderation_actions (
  id TEXT PRIMARY KEY NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('delete_message', 'ban_player')),
  target_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  details TEXT NOT NULL CHECK (json_valid(details) AND json_type(details) = 'object'),
  created_at INTEGER NOT NULL CHECK (created_at > 0)
);
CREATE UNIQUE INDEX moderation_actions_once ON moderation_actions(action, target_id);
CREATE INDEX moderation_actions_recent ON moderation_actions(created_at DESC);
