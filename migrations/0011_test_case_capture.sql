-- Migration number: 0011 	 2026-10-15T23:30:00.000Z
-- Game-derived test cases (#22). source_message_id records which message a case
-- came from so capture stays idempotent. It is deliberately not a foreign key:
-- the case must outlive the 90-day deletion of its source message. Seeds keep NULL.
ALTER TABLE test_cases ADD COLUMN source_message_id TEXT
  CHECK ((source = 'seed') = (source_message_id IS NULL));
-- Per-rule filter scores at capture time, as a JSON object (NULL for seeds).
ALTER TABLE test_cases ADD COLUMN filter_scores TEXT
  CHECK (filter_scores IS NULL OR (json_valid(filter_scores) AND json_type(filter_scores) = 'object'));
-- Filter version that produced filter_scores (NULL for seeds).
ALTER TABLE test_cases ADD COLUMN filter_version TEXT
  CHECK (source = 'seed' OR (filter_scores IS NOT NULL AND filter_version IS NOT NULL));
-- SQLite cannot add a UNIQUE column; a unique index allows many NULL seeds.
CREATE UNIQUE INDEX test_cases_source_message ON test_cases(source_message_id);
