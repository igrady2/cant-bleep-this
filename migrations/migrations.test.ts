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
