/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { loadPublicFeed } from "@/lib/messages/feed";
import { loadMessageReviewPresentation } from "./context";
import { serializeReviewerMessage } from "@/lib/presentation";
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

it("rolls review, assignment, progress and verdict back together when consensus fails", async () => {
  await vote("a", "not_ok");
  await d1.exec(`INSERT INTO player_review_progress VALUES ('b', 5);
    INSERT INTO review_assignments (id, player_id, message_id, assignment, created_at, expires_at)
      VALUES ('b', 'b', 'm', 'queue', 0, 9999999999);
    CREATE TRIGGER fail_submission_score BEFORE INSERT ON scores BEGIN SELECT RAISE(ABORT, 'test consensus failure'); END;`.replace(/\s+/g, " "));
  const submit = () => submitReview(db, { id: "b", name: "b", normalizedName: "b" }, {
    assignmentId: "b", action: "not_ok", rule: "profanity", reason: "Synthetic reason",
  });
  try {
    expect(await submit()).toMatchObject({ ok: false, status: 500 });
    expect(await d1.prepare("SELECT id FROM reviews WHERE player_id = ?").bind("b").first()).toBeNull();
    expect(await d1.prepare("SELECT consumed_at FROM review_assignments WHERE id = ?").bind("b").first())
      .toEqual({ consumed_at: null });
    expect(await d1.prepare("SELECT posts_since_review FROM player_review_progress WHERE player_id = ?").bind("b").first())
      .toEqual({ posts_since_review: 5 });
    expect(await status()).toBe("pending");
    expect(await points()).toBe(0);
  } finally { await d1.exec("DROP TRIGGER fail_submission_score"); }
  expect(await submit()).toMatchObject({ ok: true });
  expect(await status()).toBe("slip");
  expect(await points()).toBe(1);
});


it.each([false, true])("censors only the deciding spans (one reviewer empty: %s), refreshes and removes", async (empty) => {
  await d1.exec("UPDATE messages SET text = 'fuck this fuck', masked_text = 'fuck this fuck' WHERE id = 'm'");
  expect((await loadPublicFeed(db))[0].text).toBe("fuck this fuck");
  // These votes must not supply spans or the rule.
  await vote("author", "not_ok");
  await vote("a", "not_ok");
  await d1.exec("UPDATE players SET reviewer_standing = 'excluded' WHERE id = 'a'");
  await vote("b", "not_ok", "hand_picked");
  await vote("c", "not_ok", "hand_picked");
  await vote("d", "fine");
  await vote("e", "not_ok");
  await vote("f", "not_ok");
  await d1.exec("UPDATE reviews SET rule = 'hate', flagged_spans = '[{\"start\":10,\"end\":14}]' WHERE verdict = 'not_ok'");
  await d1.prepare("UPDATE reviews SET rule = 'profanity', flagged_spans = ? WHERE player_id = 'b'")
    .bind(JSON.stringify([{ start: 1, end: 4 }])).run();
  await d1.prepare("UPDATE reviews SET flagged_spans = ? WHERE player_id = 'e'")
    .bind(JSON.stringify(empty ? [] : [{ start: 0, end: 3 }])).run();
  await computeConsensus(db, "m");
  const feed = await loadPublicFeed(db);
  expect(feed[0]).toMatchObject({ text: "f*ck this fuck", slipRule: "Profanity", status: "slip" });
  expect(JSON.stringify(feed)).not.toContain("flagged_spans");
  // A different target sees this slip censored using the slip's own marks.
  await message("next");
  await d1.exec(`UPDATE messages SET context_message_ids = '["m"]' WHERE id = 'next'`);
  const review = await loadMessageReviewPresentation(db, "next");
  expect(serializeReviewerMessage(review!).text).toBe("synthetic text");
  expect(serializeReviewerMessage(review!).context[0].text).toBe("f*ck this fuck");
  await d1.exec("UPDATE messages SET status = 'excluded' WHERE id = 'm'");
  expect((await loadPublicFeed(db)).map((entry) => entry.id)).toEqual(["next"]);
  expect((await loadMessageReviewPresentation(db, "next"))!.context).toEqual([]);
  await d1.exec("DELETE FROM messages WHERE id = 'm'");
  expect((await loadPublicFeed(db)).map((entry) => entry.id)).toEqual(["next"]);
});

async function seedVote(player: string, seed: string, action: "fine" | "not_ok" | "skip") {
  const id = crypto.randomUUID();
  await d1.prepare(`INSERT INTO review_assignments (id, player_id, seed_case_id, assignment, created_at, expires_at)
    VALUES (?, ?, ?, 'queue', 0, 9999999999)`).bind(id, player, seed).run();
  const input = { assignmentId: id, action, ...(action === "not_ok" ? {rule: "profanity", reason: "Synthetic reason"} : {}) };
  return { result: await submitReview(db, {id: player, name: player, normalizedName: player}, input), input };
}
it("persists misses, excludes at three, and cannot farm or replay seeds for points", async () => {
  const seeds = ["seed-bullying_harassment-01", "seed-bullying_harassment-02", "seed-bullying_harassment-03"];
  for (const seed of seeds) expect((await seedVote("a", seed, "fine")).result.ok).toBe(true);
  expect(await d1.prepare("SELECT reviewer_standing FROM players WHERE id = ?").bind("a").first()).toEqual({reviewer_standing: "excluded"});
  const repeat = await seedVote("a", seeds[0], "fine");
  expect(repeat.result.ok).toBe(false);
  expect((await submitReview(db, {id: "a", name: "a", normalizedName: "a"}, repeat.input)).ok).toBe(false);
  expect(await points()).toBe(0);
  expect(await status()).toBe("pending");
  await vote("a", "not_ok"); await vote("b", "not_ok");
  await computeConsensus(db, "m");
  expect(await status()).toBe("pending");
  await vote("c", "fine"); await vote("d", "fine");
  await computeConsensus(db, "m");
  expect(await status()).toBe("clean"); expect(await points()).toBe(0);
});
it("keeps skips out of accuracy and blocks duplicate submissions even concurrently", async () => {
  const first = await seedVote("a", "seed-bullying_harassment-01", "skip");
  expect(first.result.ok).toBe(true);
  expect((await submitReview(db, {id: "a", name: "a", normalizedName: "a"}, first.input)).ok).toBe(false);
  const attempts = await Promise.all([
    seedVote("b", "seed-bullying_harassment-02", "fine"),
    seedVote("b", "seed-bullying_harassment-02", "fine"),
  ]);
  expect(attempts.filter(a => a.result.ok)).toHaveLength(1);
  expect(await d1.prepare("SELECT seed_correct FROM reviews WHERE player_id = ?").bind("a").first()).toEqual({seed_correct: null});
  expect(await points()).toBe(0);
});

afterEach(() => vi.unstubAllEnvs());
it("uses the configured rolling window, recovers, and checks the Not OK rule", async () => {
  vi.stubEnv("REVIEW_SEED_WINDOW", "2"); vi.stubEnv("REVIEW_SEED_MISSES", "1");
  expect((await seedVote("a", "seed-bullying_harassment-01", "not_ok")).result.ok).toBe(true);
  expect(await d1.prepare("SELECT seed_correct FROM reviews WHERE player_id = ?").bind("a").first()).toEqual({seed_correct: 0});
  const { updateStanding } = await import("./standing");
  for (let i = 0; i < 2; i++) {
    const seed = `clean-seed-${i}`;
    await d1.prepare(`INSERT INTO test_cases VALUES (?, 'hello', '[]', 'fine', NULL, '[]', 'seed', 'v1')`).bind(seed).run();
    const saved = await seedVote("a", seed, "fine");
    expect(saved.result.ok).toBe(true);
  }
  expect(await d1.prepare("SELECT reviewer_standing FROM players WHERE id = ?").bind("a").first()).toEqual({reviewer_standing: "good"});
  // A nonexistent review cannot change standing.
  await updateStanding(db, "a", "missing").run!();
});


it("keeps the feed available and masks the full slip when stored spans are out of range", async () => {
  await d1.exec("UPDATE messages SET text = 'fuck this fuck', masked_text = 'fuck this fuck' WHERE id = 'm'");
  await vote("a", "not_ok"); await vote("b", "not_ok");
  await d1.prepare("UPDATE reviews SET rule = 'profanity', flagged_spans = ?")
    .bind(JSON.stringify([{ start: 99, end: 100 }])).run();
  await computeConsensus(db, "m");
  await message("next");
  const feed = await loadPublicFeed(db);
  expect(feed.find((entry) => entry.id === "m")).toMatchObject({ text: "f*ck th*s f*ck", status: "slip" });
  expect(feed.find((entry) => entry.id === "next")).toMatchObject({ text: "synthetic text" });
});

it("excludes seed reviews from the censor deciding set", async () => {
  await d1.exec("UPDATE messages SET text = 'fuck this fuck', masked_text = 'fuck this fuck' WHERE id = 'm'");
  await seedVote("a", "seed-profanity-01", "not_ok");
  await d1.prepare("UPDATE reviews SET seed_case_id = ?, rule = 'hate', flagged_spans = ? WHERE player_id = 'a'")
    .bind("seed-profanity-01", JSON.stringify([{ start: 10, end: 14 }])).run();
  await vote("b", "not_ok"); await vote("c", "not_ok");
  await d1.prepare("UPDATE reviews SET rule = 'profanity', flagged_spans = ? WHERE player_id IN ('b', 'c')")
    .bind(JSON.stringify([{ start: 0, end: 4 }])).run();
  await computeConsensus(db, "m");
  expect((await loadPublicFeed(db))[0]).toMatchObject({ text: "f*ck this fuck", slipRule: "Profanity" });
});
