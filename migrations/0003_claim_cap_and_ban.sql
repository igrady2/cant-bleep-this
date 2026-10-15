-- Migration number: 0003 	 2026-10-15T17:45:00.000Z
-- Name-claim rate limit by salted IP hash (#9). Ban timestamp reserved for #24 admin flows.
ALTER TABLE players ADD COLUMN banned_at INTEGER CHECK (banned_at IS NULL OR banned_at > 0);

CREATE TABLE ip_daily_claims (
  ip_hash TEXT NOT NULL,
  day TEXT NOT NULL,
  claim_count INTEGER NOT NULL DEFAULT 0 CHECK (claim_count >= 0 AND claim_count <= 3),
  PRIMARY KEY (ip_hash, day)
);
