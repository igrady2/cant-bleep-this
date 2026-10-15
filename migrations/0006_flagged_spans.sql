-- Migration number: 0006 	 2026-10-15T20:10:00.000Z
-- Flagged character spans on Not OK reviews (#16). Offsets into the reviewed
-- PII-masked serializeReviewerMessage text, in UTF-16 code units
-- (start inclusive, end exclusive). Empty JSON array for Fine,
-- Skip, and Not OK with no taps. Never a bare word string.
ALTER TABLE reviews ADD COLUMN flagged_spans TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(flagged_spans) AND json_type(flagged_spans) = 'array')
  CHECK (flagged_spans = '[]' OR (verdict IS NOT NULL AND verdict = 'not_ok'));
