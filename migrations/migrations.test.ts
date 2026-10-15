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

  it("reserves at most one hand-picked review slot per message", () => {
    const sql = readFileSync(join(import.meta.dirname, "0005_hand_picked_reservations.sql"), "utf8");
    expect(sql).toContain("hand_picked_review_reservations");
    expect(sql).toMatch(/message_id TEXT PRIMARY KEY/i);
  });
});
