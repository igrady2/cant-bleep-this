/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createMessageReviewAssignment, findOpenReviewAssignment, releaseExpiredReviewAssignments } from "./assignments";
import type { ReviewsDatabase } from "./db";

interface TestD1Statement {
  bind(...args: unknown[]): TestD1Statement;
  run(): Promise<unknown>;
  first<T>(): Promise<T | null>;
}
interface TestD1Database {
  exec(sql: string): Promise<unknown>;
  prepare(sql: string): TestD1Statement;
}
const bindings = env as unknown as { REVIEWS_TEST_DB: TestD1Database; REVIEW_ASSIGNMENTS_SCHEMA: string };
const d1 = bindings.REVIEWS_TEST_DB;
const db = d1 as unknown as ReviewsDatabase;
const now = 1_700_000_000;

beforeAll(async () => {
  await d1.exec(`CREATE TABLE players (id TEXT PRIMARY KEY);
    CREATE TABLE messages (id TEXT PRIMARY KEY, status TEXT, author_id TEXT, created_at INTEGER, filter_outcome TEXT);
    CREATE TABLE test_cases (id TEXT PRIMARY KEY);
    CREATE TABLE reviews (message_id TEXT, assignment TEXT, skipped INTEGER);`);
  // Execute the actual migration, including its partial unique index.
  for (const statement of bindings.REVIEW_ASSIGNMENTS_SCHEMA.replace(/--[^\n]*/g, "").split(";")) {
    if (statement.trim()) await d1.prepare(statement).run();
  }
  await d1.exec("INSERT INTO players VALUES ('a'), ('b'); INSERT INTO messages (id) VALUES ('m');");
});
beforeEach(async () => {
  await d1.exec("DELETE FROM review_assignments; DELETE FROM reviews;");
});

describe("real D1 review reservations", () => {
  it("concurrently reserves only one hand-picked slot and falls back to queue", async () => {
    const results = await Promise.all([
      createMessageReviewAssignment(db, "a", "m", true, now),
      createMessageReviewAssignment(db, "b", "m", true, now),
    ]);
    expect(results.map(r => r.assignment).sort()).toEqual(["hand_picked", "queue"]);
    expect((await d1.prepare("SELECT COUNT(*) AS n FROM review_assignments").first<{ n: number }>())?.n).toBe(2);
  });

  it("enforces the partial unique index even for direct competing inserts", async () => {
    const insert = (id: string) => d1.prepare(`INSERT INTO review_assignments
      (id, player_id, message_id, assignment, created_at, expires_at)
      VALUES (?, ?, 'm', 'hand_picked', ?, ?)`).bind(id, id, now, now + 10).run();
    const results = await Promise.allSettled([insert("a"), insert("b")]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
  });

  it("releases expired reservations so another player can reserve", async () => {
    const first = await createMessageReviewAssignment(db, "a", "m", true, now);
    await d1.prepare("UPDATE review_assignments SET expires_at = ? WHERE id = ?").bind(now + 1, first.id).run();
    await releaseExpiredReviewAssignments(db, now + 1);
    expect(await findOpenReviewAssignment(db, "a", now + 1)).toBeNull();
    const second = await createMessageReviewAssignment(db, "b", "m", true, now + 1);
    expect(second.assignment).toBe("hand_picked");
    expect((await d1.prepare("SELECT consumed_at FROM review_assignments WHERE id = ?").bind(first.id).first<{ consumed_at: number }>())?.consumed_at).toBe(now + 1);
  });

  it("finds only unconsumed, unexpired assignments for the requested player", async () => {
    const first = await createMessageReviewAssignment(db, "a", "m", false, now);
    expect(await findOpenReviewAssignment(db, "a", now)).toMatchObject({ id: first.id, message_id: "m", seed_case_id: null });
    expect(await findOpenReviewAssignment(db, "b", now)).toBeNull();
    await d1.prepare("UPDATE review_assignments SET consumed_at = ?").bind(now).run();
    expect(await findOpenReviewAssignment(db, "a", now)).toBeNull();
  });
});
