/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { submitReview } from "./submit";
import { assignNextFromQueue } from "./assign";
import type { ReviewsDatabase } from "./db";

// Keep target sampling deterministic; assignment lifecycle uses the real D1 database.
vi.mock("./queue", () => ({ pickNextQueueTarget: vi.fn().mockResolvedValue(null) }));

interface TestStatement {
  bind(...values: unknown[]): TestStatement;
  run(): Promise<unknown>;
  first<T>(): Promise<T | null>;
}
const { REVIEWS_TEST_DB: d1, FLAGGED_SPANS_SCHEMA: schema } = env as unknown as {
  REVIEWS_TEST_DB: {
    exec(sql: string): Promise<unknown>;
    prepare(sql: string): TestStatement;
  }; FLAGGED_SPANS_SCHEMA: string;
};
const db = d1 as unknown as ReviewsDatabase;
const player = { id: "reviewer", name: "sam", normalizedName: "sam" };
beforeAll(async () => {
  await d1.exec(`CREATE TABLE players (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE messages (id TEXT PRIMARY KEY, author_id TEXT, text TEXT, masked_text TEXT, filter_outcome TEXT, status TEXT, context_message_ids TEXT, filter_scores TEXT DEFAULT '{}', created_at INTEGER DEFAULT 0);
    CREATE TABLE review_assignments (id TEXT PRIMARY KEY, message_id TEXT, seed_case_id TEXT, player_id TEXT, assignment TEXT, consumed_at INTEGER, expires_at INTEGER, created_at INTEGER DEFAULT 0);
    CREATE TABLE test_cases (id TEXT PRIMARY KEY, source TEXT);
    CREATE TABLE reviews (id TEXT PRIMARY KEY, message_id TEXT, seed_case_id TEXT, player_id TEXT, verdict TEXT, rule TEXT, reason TEXT, skipped INTEGER, seed_correct INTEGER, assignment TEXT, created_at INTEGER);`);
  for (const sql of schema.replace(/--[^\n]*/g, "").split(";")) {
    if (sql.trim()) await d1.prepare(sql).run();
  }
  await d1.exec("INSERT INTO players VALUES ('author', 'kai');");
});
beforeEach(async () => {
  await d1.exec(`DELETE FROM reviews; DELETE FROM review_assignments; DELETE FROM messages;
    INSERT INTO messages (id, author_id, text, masked_text, filter_outcome, status, context_message_ids) VALUES ('m', 'author', '1234567 rude', NULL, 'passed', 'pending', '[]');
    INSERT INTO review_assignments (id, message_id, seed_case_id, player_id, assignment, consumed_at, expires_at) VALUES ('a', 'm', NULL, 'reviewer', 'queue', NULL, 9999999999);`);
});
it("stores UTF-16 offsets into the serialized text after a seven-digit run", async () => {
  const result = await submitReview(db, player, {
    assignmentId: "a", action: "not_ok", rule: "bullying_harassment", reason: "Synthetic rude word",
    flaggedSpans: [{ start: 11, end: 15 }],
  });
  expect(result.ok).toBe(true);
  const row = await d1.prepare("SELECT flagged_spans FROM reviews").first<{ flagged_spans: string }>();
  expect(JSON.parse(row!.flagged_spans)).toEqual([{ start: 11, end: 15 }]);
  expect("[redacted] rude".slice(11, 15)).toBe("rude");
});
it.each(["clean", "slip", "caught", "false_positive", "excluded"])("rejects a message decided as %s while its assignment was open", async (status) => {
  await d1.prepare("UPDATE messages SET status = ?").bind(status).run();
  expect(await submitReview(db, player, { assignmentId: "a", action: "fine" })).toMatchObject({ ok: false, status: 409, code: "message_unavailable" });
  expect((await d1.prepare("SELECT COUNT(*) AS n FROM reviews").first<{ n: number }>())!.n).toBe(0);
  expect((await d1.prepare("SELECT consumed_at FROM review_assignments WHERE id = 'a'").first<{ consumed_at: number | null }>())!.consumed_at).not.toBeNull();
  expect(await assignNextFromQueue(db, player)).toMatchObject({ ok: false, code: "queue_empty" });
});
it("consumes every stale open message assignment on a direct queue refresh", async () => {
  await d1.exec(`UPDATE messages SET status = 'clean';
    INSERT INTO review_assignments (id, message_id, player_id, assignment, expires_at) VALUES ('b', 'm', 'reviewer', 'queue', 9999999999);`);
  expect(await assignNextFromQueue(db, player)).toMatchObject({ ok: false, code: "queue_empty" });
  expect((await d1.prepare("SELECT COUNT(*) AS n FROM review_assignments WHERE consumed_at IS NULL").first<{ n: number }>())!.n).toBe(0);
  expect((await d1.prepare("SELECT COUNT(*) AS n FROM reviews").first<{ n: number }>())!.n).toBe(0);
});
it("rejects self-review at insertion", async () => {
  await d1.exec("UPDATE messages SET author_id = 'reviewer'; INSERT INTO players VALUES ('reviewer', 'sam');");
  expect(await submitReview(db, player, { assignmentId: "a", action: "fine" })).toMatchObject({ ok: false, status: 409 });
});
it.each(["fine", null])("database rejects spans with verdict %s even when bypassing validation", async (verdict) => {
  await expect(d1.prepare("INSERT INTO reviews (id, verdict, flagged_spans) VALUES ('invalid', ?, '[{}]')").bind(verdict).run()).rejects.toThrow();
});
