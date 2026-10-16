-- Migration number: 0012 	 2026-10-15T23:55:00.000Z
-- Admin triage (#23). source_status records the verdict that produced a game
-- case, so slips and false positives stay distinguishable from caught and clean
-- cases after the 90-day deletion of the source message. Seeds keep NULL.
ALTER TABLE test_cases ADD COLUMN source_status TEXT
  CHECK (source_status IS NULL OR (source = 'game' AND source_status IN ('slip', 'caught', 'clean', 'false_positive')));
-- Backfill cases whose source message still exists; older cases stay NULL.
UPDATE test_cases SET source_status = (
  SELECT m.status FROM messages m
  WHERE m.id = test_cases.source_message_id AND m.status IN ('slip', 'caught', 'clean', 'false_positive')
) WHERE source = 'game';
CREATE INDEX test_cases_triage ON test_cases(source_status, rule)
  WHERE source_status IN ('slip', 'false_positive');

-- Maintainer trick tags on triage items. Cases are permanent, so the foreign
-- key is safe; deleting a case removes its tags.
CREATE TABLE triage_tags (
  test_case_id TEXT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  tag TEXT NOT NULL CHECK (tag IN ('spelling', 'sound', 'meaning', 'context')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (test_case_id, tag)
);
