/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { ReviewsDatabase } from "./db";
import { findReviewRequirementBlock, postsAllowedBetweenReviews, recordPostForReviewRequirement } from "./review-requirement";
import { submitReview } from "./submit";
import { postMessage } from "@/lib/messages/post";
import { CATEGORIES } from "@/lib/moderation/categories";

const { moderate } = vi.hoisted(() => ({ moderate: vi.fn() }));
vi.mock("@/lib/moderation", () => ({ moderate }));
// The post tests exercise persistence here; context loading has its own tests.
vi.mock("@/lib/messages/room-context", () => ({
  loadPostRoomContext: vi.fn(async () => ({ contextMessageIds: [], context: [], roomUsernames: [] })),
}));

const { REVIEWS_TEST_DB: d1, CONSENSUS_SCHEMA: schema } = env as unknown as {
  REVIEWS_TEST_DB: {
    exec(sql: string): Promise<unknown>;
    prepare(sql: string): {
      bind(...values: unknown[]): { run(): Promise<unknown>; first<T>(): Promise<T | null> };
      first<T>(): Promise<T | null>;
    };
  }; CONSENSUS_SCHEMA: string;
};
const db = d1 as unknown as ReviewsDatabase;
const player = { id: "poster", name: "poster", normalizedName: "poster" };

beforeAll(async () => {
  await d1.exec(schema.replace(/--[^\n]*/g, "").replace(/\s+/g, " "));
});
beforeEach(async () => {
  await d1.exec(`DELETE FROM review_assignments; DELETE FROM reviews; DELETE FROM messages;
    DELETE FROM players; DELETE FROM player_daily_posts; DELETE FROM site_daily_posts;`);
  for (const id of ["poster", "author"]) {
    await d1.prepare(`INSERT INTO players (id, name, normalized_name, token_hash, created_at, last_played_at)
      VALUES (?, ?, ?, 'hash', 0, 0)`).bind(id, id, id).run();
  }
  moderate.mockResolvedValue({
    outcome: "passed", allowed: true, provider: "typesafe", model: "jev-test",
    threshold: 0.5, offLimitsThreshold: 0.5, offLimitsScore: 0,
    flags: [], scores: Object.fromEntries(CATEGORIES.map((c) => [c.id, 0.01])),
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

async function queue(size: number) {
  await d1.prepare(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x < ?)
    INSERT INTO messages (id, author_id, text, masked_text, context_message_ids, filter_scores,
      filter_version, filter_outcome, status, created_at)
    SELECT 'm' || x, 'author', 'hello', 'hello', '[]', '{}', 'v1', 'passed', 'pending', x FROM n`)
    .bind(size).run();
}
async function progress() {
  return (await d1.prepare("SELECT posts_since_review AS n FROM player_review_progress WHERE player_id = 'poster'")
    .first<{ n: number }>())?.n ?? 0;
}
async function assignment(kind = "queue") {
  await d1.prepare(`INSERT INTO review_assignments (id, player_id, message_id, assignment, created_at, expires_at)
    VALUES ('a', 'poster', 'm1', ?, 0, 9999999999)`).bind(kind).run();
}

it.each([[0, null], [9, null], [10, 5], [49, 5], [50, 3], [199, 3], [200, 1], [201, 1]])(
  "queue size %i allows %s posts", (size, expected) => {
    expect(postsAllowedBetweenReviews(size!)).toBe(expected);
  },
);
it("reads tuned tiers at runtime and falls back on invalid settings", () => {
  vi.stubEnv("REVIEW_REQUIREMENT_TIERS", '[{"queueSize":2,"posts":7},{"queueSize":20,"posts":2}]');
  expect(postsAllowedBetweenReviews(1)).toBeNull();
  expect(postsAllowedBetweenReviews(2)).toBe(7);
  expect(postsAllowedBetweenReviews(20)).toBe(2);
  for (const value of ["broken", "[]", '[{"queueSize":0,"posts":0}]', '[{"queueSize":50,"posts":1},{"queueSize":10,"posts":5}]']) {
    vi.stubEnv("REVIEW_REQUIREMENT_TIERS", value);
    expect(postsAllowedBetweenReviews(50)).toBe(3);
  }
});
it.each([[9, 6], [10, 5], [49, 5], [50, 3], [199, 3], [200, 1]])(
  "enforces %i pending messages atomically after %i posts", async (size, allowance) => {
    await queue(size);
    for (let i = 0; i < allowance; i++) await db.batch([recordPostForReviewRequirement(db, player.id)]);
    if (size < 10) {
      expect(await findReviewRequirementBlock(db, player.id)).toBeNull();
    } else {
      expect(await findReviewRequirementBlock(db, player.id)).toMatchObject({ code: "review_required" });
      await expect(db.batch([recordPostForReviewRequirement(db, player.id)])).rejects.toThrow("review_requirement_nonnegative");
      expect(await progress()).toBe(allowance);
    }
  },
);
it("counts only pending reviewable messages and adapts when the queue shrinks", async () => {
  await queue(200);
  await db.batch([recordPostForReviewRequirement(db, player.id)]);
  expect(await findReviewRequirementBlock(db, player.id)).not.toBeNull();
  await d1.exec("UPDATE messages SET status = 'clean' WHERE id <> 'm1'");
  expect(await findReviewRequirementBlock(db, player.id)).toBeNull();
});
it.each([["queue", "fine"], ["queue", "skip"], ["hand_picked", "fine"]] as const)(
  "%s %s resets progress, including posts in the same second", async (kind, action) => {
    await queue(200);
    await db.batch([recordPostForReviewRequirement(db, player.id)]);
    await assignment(kind);
    expect(await submitReview(db, player, { assignmentId: "a", action })).toMatchObject({ ok: true });
    expect(await progress()).toBe(0);
    expect(await findReviewRequirementBlock(db, player.id)).toBeNull();
    expect(await postMessage(db, player, { text: "resumed draft" })).toMatchObject({ ok: true });
    expect(await submitReview(db, player, { assignmentId: "a", action })).toMatchObject({ ok: false });
    expect(await progress()).toBe(1);
  },
);
it("invalid reviews and hand-picked skips do not reset progress", async () => {
  await queue(200);
  await db.batch([recordPostForReviewRequirement(db, player.id)]);
  await assignment("hand_picked");
  expect(await submitReview(db, player, { assignmentId: "a", action: "not_ok" })).toMatchObject({ ok: false });
  expect(await progress()).toBe(1);
  expect(await submitReview(db, player, { assignmentId: "a", action: "skip" })).toMatchObject({ ok: true });
  expect(await progress()).toBe(1);
});
it("concurrent posts cannot use the same allowance, and failed batches leave all counters unchanged", async () => {
  await queue(200);
  const results = await Promise.all(["first", "second"].map((text) => postMessage(db, player, { text })));
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(results.find((r) => !r.ok)).toMatchObject({ status: 409, code: "review_required" });
  expect(await progress()).toBe(1);
  expect(await d1.prepare("SELECT post_count FROM player_daily_posts WHERE player_id = 'poster'").first())
    .toEqual({ post_count: 1 });
});
it("idempotent retries still return the saved post when a review is now due", async () => {
  await queue(200);
  const input = { text: "hello", idempotencyKey: crypto.randomUUID() };
  expect(await postMessage(db, player, input)).toMatchObject({ ok: true });
  expect(await postMessage(db, player, input)).toMatchObject({ ok: true });
  expect(moderate).toHaveBeenCalledOnce();
  expect(await progress()).toBe(1);
});
