/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it } from "vitest";
import { computeConsensus } from "./verdicts";
import { submitReview } from "./submit";
import type { ReviewsDatabase } from "./db";

const { REVIEWS_TEST_DB: d1, CONSENSUS_SCHEMA: schema } = env as unknown as {
  REVIEWS_TEST_DB: {
    exec(sql: string): Promise<unknown>;
    prepare(sql: string): {
      bind(...values: unknown[]): {
        run(): Promise<unknown>;
        first<T>(): Promise<T | null>;
      };
      first<T>(): Promise<T | null>;
    };
  };
  CONSENSUS_SCHEMA: string;
};
const db = d1 as unknown as ReviewsDatabase;
beforeAll(async () => {
  // exec accepts complete trigger bodies, unlike splitting SQL on semicolons.
  await d1.exec(schema.replace(/--[^\n]*/g, "").replace(/\s+/g, " "));
});
beforeEach(async () => {
  await d1.exec("DELETE FROM review_assignments; DELETE FROM reviews; DELETE FROM messages; DELETE FROM scores; DELETE FROM players;");
  for (const id of ["author", "a", "b", "c", "d", "e", "f"]) {
    await d1.prepare(`INSERT INTO players (id, name, normalized_name, token_hash, created_at, last_played_at)
      VALUES (?, ?, ?, 'hash', 0, 0)`).bind(id, id, id).run();
  }
  await message("m");
});
async function message(id: string, outcome = "passed", status = "pending") {
  await d1.prepare(`INSERT INTO messages (id, author_id, text, masked_text, context_message_ids,
    filter_scores, filter_version, filter_outcome, status, created_at)
    VALUES (?, 'author', 'synthetic text', 'synthetic text', '[]', '{}', 'v1', ?, ?, 1)`)
    .bind(id, outcome, status).run();
}
async function vote(player: string, verdict: string | null, assignment = "queue", target = "m") {
  await d1.prepare(`INSERT INTO reviews (id, message_id, player_id, verdict, skipped, assignment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 100)`)
    .bind(crypto.randomUUID(), target, player, verdict, verdict === null ? 1 : 0, assignment).run();
}
async function status(target = "m") {
  return (await d1.prepare("SELECT status FROM messages WHERE id = ?").bind(target).first<{status: string}>())!.status;
}
async function points() {
  return (await d1.prepare("SELECT COALESCE(SUM(slips), 0) AS n FROM scores").first<{n: number}>())!.n;
}
it.each([
  ["passed", "not_ok", "slip", 1], ["passed", "fine", "clean", 0],
  ["blocked", "not_ok", "caught", 0], ["blocked", "fine", "false_positive", 0],
])("maps %s / %s to %s", async (outcome, verdict, expected, score) => {
  await message("target", outcome as string);
  await vote("a", verdict as string, "queue", "target");
  await computeConsensus(db, "target");
  expect(await status("target")).toBe("pending");
  await vote("b", verdict as string, "queue", "target");
  await computeConsensus(db, "target");
  expect(await status("target")).toBe(expected);
  expect(await points()).toBe(score);
});
it("uses the first matching pair within three, ignoring later votes and rule differences", async () => {
  await vote("a", "not_ok"); await vote("b", "fine"); await vote("c", "not_ok");
  await vote("d", "fine"); await vote("e", "fine");
  await d1.prepare("UPDATE reviews SET rule = ? WHERE player_id = ?").bind("profanity", "a").run();
  await computeConsensus(db, "m");
  expect(await status()).toBe("slip");
  expect(await points()).toBe(1);
});
it("ignores skips, authors and excluded reviewers before limiting votes", async () => {
  await vote("author", "fine"); await vote("a", "fine");
  await d1.exec("UPDATE players SET reviewer_standing = 'excluded' WHERE id = 'a'");
  await vote("b", null, "hand_picked"); await vote("c", null);
  await vote("d", "not_ok", "hand_picked"); await vote("e", "not_ok");
  await computeConsensus(db, "m");
  expect(await status()).toBe("slip");
});
it("allows only the first eligible hand-picked vote", async () => {
  await vote("a", "not_ok", "hand_picked"); await vote("b", "not_ok", "hand_picked");
  await computeConsensus(db, "m");
  expect(await status()).toBe("pending");
  await vote("c", "fine"); await vote("d", "fine");
  await computeConsensus(db, "m");
  expect(await status()).toBe("clean");
});
it("keeps existing author points when a blocked message is judged fine", async () => {
  await d1.exec("INSERT INTO scores VALUES ('author', '2026-10-01', 4)");
  await message("blocked", "blocked");
  await vote("a", "fine", "queue", "blocked"); await vote("b", "fine", "queue", "blocked");
  await computeConsensus(db, "blocked");
  expect(await status("blocked")).toBe("false_positive");
  expect(await points()).toBe(4);
});
it("never decides off-limits messages or missing targets", async () => {
  await d1.prepare(`INSERT INTO messages (id, author_id, context_message_ids, filter_scores,
    filter_version, filter_outcome, status, created_at)
    VALUES ('off', 'author', '[]', '{}', 'v1', 'off_limits', 'excluded', 1)`).bind().run();
  await vote("a", "not_ok", "queue", "off"); await vote("b", "not_ok", "queue", "off");
  await computeConsensus(db, "off"); await computeConsensus(db, "missing");
  expect(await status("off")).toBe("excluded"); expect(await points()).toBe(0);
});
it("awards late slips on confirmation day and concurrent retries award exactly once", async () => {
  await vote("a", "not_ok"); await vote("b", "not_ok");
  await Promise.all(Array.from({length: 8}, () => computeConsensus(db, "m")));
  expect(await points()).toBe(1);
  const row = await d1.prepare("SELECT day FROM scores").first<{day: string}>();
  expect(row!.day).toBe(new Date().toISOString().slice(0, 10));
  await message("another");
  await vote("a", "not_ok", "queue", "another"); await vote("b", "not_ok", "queue", "another");
  await computeConsensus(db, "another");
  expect(await points()).toBe(2);
});
it("rolls the verdict back if awarding the score fails", async () => {
  await vote("a", "not_ok"); await vote("b", "not_ok");
  await d1.exec("CREATE TRIGGER fail_score BEFORE INSERT ON scores BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
  try {
    await expect(computeConsensus(db, "m")).rejects.toThrow();
    expect(await status()).toBe("pending"); expect(await points()).toBe(0);
  } finally { await d1.exec("DROP TRIGGER fail_score"); }
  await computeConsensus(db, "m");
  expect(await points()).toBe(1);
});
it.each(["clean", "caught", "false_positive", "excluded"])("does not reopen %s", async (existing) => {
  await d1.prepare("UPDATE messages SET status = ?").bind(existing).run();
  await vote("a", "not_ok"); await vote("b", "not_ok");
  await computeConsensus(db, "m");
  expect(await status()).toBe(existing); expect(await points()).toBe(0);
});
it("concurrent and duplicate submissions cannot double score", async () => {
  await vote("a", "not_ok");
  for (const id of ["b", "c"]) {
    await d1.prepare(`INSERT INTO review_assignments (id, player_id, message_id, assignment, created_at, expires_at)
      VALUES (?, ?, 'm', 'queue', 0, 9999999999)`).bind(id, id).run();
  }
  const submit = (id: string) => submitReview(db, {id, name: id, normalizedName: id}, {
    assignmentId: id, action: "not_ok", rule: "profanity", reason: "Synthetic reason",
  });
  const results = await Promise.all([submit("b"), submit("b"), submit("c")]);
  expect(results.some((result) => result.ok)).toBe(true);
  expect(await status()).toBe("slip"); expect(await points()).toBe(1);
  expect((await submit("b")).ok).toBe(false);
  await computeConsensus(db, "m"); expect(await points()).toBe(1);
});
