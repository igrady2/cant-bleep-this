-- Migration number: 0013 	 2026-10-16T01:00:00.000Z
-- Filter releases (#26). A row is a #25 filter version that passed the release
-- gate and went live, with the report fingerprints that prove which version and
-- test set were gated. Releases are permanent, like the test set.
CREATE TABLE filter_releases (
  version TEXT PRIMARY KEY NOT NULL,
  released_at INTEGER NOT NULL CHECK (released_at > 0),
  baseline_version TEXT NOT NULL CHECK (baseline_version <> version),
  config_fingerprint TEXT NOT NULL,
  test_set_fingerprint TEXT NOT NULL,
  baseline_catches INTEGER NOT NULL CHECK (baseline_catches >= 0),
  catches INTEGER NOT NULL CHECK (catches > baseline_catches),
  baseline_false_positives INTEGER NOT NULL CHECK (baseline_false_positives >= 0),
  false_positives INTEGER NOT NULL CHECK (false_positives >= 0 AND false_positives <= baseline_false_positives)
);

-- When players confirmed a game case (Unix seconds): the latest non-skipped
-- review at capture. Patch time needs it after reviews are deleted at 90 days.
ALTER TABLE test_cases ADD COLUMN confirmed_at INTEGER
  CHECK (confirmed_at IS NULL OR (source = 'game' AND confirmed_at >= 0));
-- Backfill cases whose source reviews still exist; older cases stay NULL.
UPDATE test_cases SET confirmed_at = (
  SELECT MAX(r.created_at) FROM reviews r
  WHERE r.message_id = test_cases.source_message_id AND r.skipped = 0
) WHERE source = 'game';

-- A slip the first release to catch it patched. Points are never touched: the
-- board reads scores, and nothing here writes them. patch_seconds is
-- released_at - confirmed_at for the patch-time success measure (NULL when the
-- confirmation time is unknown).
CREATE TABLE patched_slips (
  test_case_id TEXT PRIMARY KEY NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  version TEXT NOT NULL REFERENCES filter_releases(version),
  confirmed_at INTEGER CHECK (confirmed_at IS NULL OR confirmed_at >= 0),
  released_at INTEGER NOT NULL CHECK (released_at > 0),
  patch_seconds INTEGER CHECK (patch_seconds IS NULL OR patch_seconds >= 0),
  CHECK ((confirmed_at IS NULL) = (patch_seconds IS NULL))
);
CREATE INDEX patched_slips_version ON patched_slips(version);
