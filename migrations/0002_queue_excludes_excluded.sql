-- Migration number: 0002 	 2026-10-15T15:40:00.000Z
-- Review queue scans must skip off-limits rows and maintainer-excluded status.
DROP INDEX IF EXISTS messages_queue;
CREATE INDEX messages_queue ON messages(status, created_at, id)
  WHERE filter_outcome IN ('passed', 'blocked') AND status <> 'excluded';
