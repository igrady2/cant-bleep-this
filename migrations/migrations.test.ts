import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("D1 migrations", () => {
  it("adds claim-cap storage and a nullable ban timestamp", () => {
    const sql = readFileSync(join(import.meta.dirname, "0003_claim_cap_and_ban.sql"), "utf8");
    expect(sql).toContain("ip_daily_claims");
    expect(sql).toContain("claim_count");
    expect(sql).toContain("banned_at");
  });

  it("adds daily post cap tables for players and the site", () => {
    const sql = readFileSync(join(import.meta.dirname, "0004_daily_post_caps.sql"), "utf8");
    expect(sql).toContain("player_daily_posts");
    expect(sql).toContain("site_daily_posts");
    expect(sql).toContain("<= 20");
    expect(sql).toContain("<= 2000");
  });

  it("scopes the review queue index to deliverable rows", () => {
    const sql = readFileSync(join(import.meta.dirname, "0002_queue_excludes_excluded.sql"), "utf8");
    expect(sql).toMatch(/messages_queue/i);
    expect(sql).toContain("filter_outcome IN ('passed', 'blocked')");
    expect(sql).toContain("status <> 'excluded'");
  });

  it("stores server-owned review assignments with expiry and scan indexes", () => {
    const sql = readFileSync(join(import.meta.dirname, "0005_hand_picked_reservations.sql"), "utf8");
    expect(sql).toContain("review_assignments");
    expect(sql).toContain("player_id");
    expect(sql).toContain("expires_at");
    expect(sql).toContain("consumed_at");
    expect(sql).toContain("review_assignments_hand_picked_slot");
    expect(sql).toContain("messages_review_queue_scan");
  });
});

  it("stores flagged character spans on reviews as a JSON array", () => {
    const sql = readFileSync(join(import.meta.dirname, "0006_flagged_spans.sql"), "utf8");
    expect(sql).toContain("flagged_spans");
    expect(sql).toContain("json_valid(flagged_spans)");
    expect(sql).toContain("json_type(flagged_spans) = 'array'");
    expect(sql).not.toMatch(/0002_/);
  });


it("adds seed attempt uniqueness and loads the curated seed pool", () => {
  const sql = readFileSync(join(import.meta.dirname, "0009_seed_checks_standing.sql"), "utf8");
  expect(sql).toContain("CREATE UNIQUE INDEX reviews_seed_once");
  expect(sql).toContain("seed-bullying_harassment-01");
});

it("adds idempotent, FK-free source tracking and filter results to test cases", () => {
  const sql = readFileSync(join(import.meta.dirname, "0011_test_case_capture.sql"), "utf8");
  expect(sql).toContain("ADD COLUMN source_message_id TEXT");
  expect(sql).toContain("CREATE UNIQUE INDEX test_cases_source_message ON test_cases(source_message_id)");
  expect(sql).toContain("json_type(filter_scores) = 'object'");
  expect(sql).toContain("ADD COLUMN filter_version TEXT");
  expect(sql).not.toMatch(/REFERENCES/i);
});

it("records the deciding status on game cases and stores triage tags", () => {
  const sql = readFileSync(join(import.meta.dirname, "0012_admin_triage.sql"), "utf8");
  expect(sql).toContain("ADD COLUMN source_status TEXT");
  expect(sql).toContain("source_status IN ('slip', 'caught', 'clean', 'false_positive')");
  expect(sql).toContain("CREATE INDEX test_cases_triage");
  expect(sql).toContain("CREATE TABLE triage_tags");
  expect(sql).toContain("tag IN ('spelling', 'sound', 'meaning', 'context')");
  expect(sql).toContain("REFERENCES test_cases(id) ON DELETE CASCADE");
});

it("records filter releases, patched slips and confirmation times without touching scores", () => {
  const sql = readFileSync(join(import.meta.dirname, "0013_filter_releases.sql"), "utf8");
  expect(sql).toContain("CREATE TABLE filter_releases");
  expect(sql).toContain("released_at INTEGER NOT NULL");
  expect(sql).toContain("CHECK (catches > baseline_catches)");
  expect(sql).toContain("false_positives <= baseline_false_positives");
  expect(sql).toContain("ADD COLUMN confirmed_at INTEGER");
  expect(sql).toContain("CREATE TABLE patched_slips");
  expect(sql).toContain("test_case_id TEXT PRIMARY KEY NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE");
  expect(sql).toContain("patch_seconds INTEGER");
  expect(sql).not.toMatch(/(UPDATE|INSERT INTO|DELETE FROM)\s+scores/i);
});
