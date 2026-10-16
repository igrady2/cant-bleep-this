/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it } from "vitest";
import { removeMessageAsMaintainer, type MaintainerRemovalDatabase } from "@/lib/messages/maintainer-removal";
import { normalizeUsername } from "@/lib/players/policy";
import { submitReview } from "@/lib/reviews/submit";
import type { ReviewsDatabase } from "@/lib/reviews/db";
import { captureTestCase } from "./capture";

const { REVIEWS_TEST_DB: d1, CONSENSUS_SCHEMA: schema, ADMIN_MODERATION_SCHEMA: adminSchema } = env as unknown as {
  REVIEWS_TEST_DB: {
    exec(sql: string): Promise<unknown>;
    prepare(sql: string): {
      bind(...values: unknown[]): {
        run(): Promise<unknown>;
        first<T>(): Promise<T | null>;
        all<T>(): Promise<{ results: T[] }>;
      };
    };
  };
  CONSENSUS_SCHEMA: string;
  ADMIN_MODERATION_SCHEMA: string;
};
const db = d1 as unknown as ReviewsDatabase;

interface TestCaseRow {
  confirmed_at: number | null;
  message: string;
  context_snapshot: string;
  expected_verdict: string;
  rule: string | null;
  reasons: string;
  source: string;
  version_added: string;
  source_message_id: string;
  filter_scores: string;
  filter_version: string;
  source_status: string | null;
}

const SCORES = JSON.stringify({ sexual_content: 0.42, profanity: 0.01, off_limits: 0.02 });

beforeAll(async () => {
  await d1.exec(schema.replace(/--[^\n]*/g, "").replace(/\s+/g, " "));
  await d1.exec(adminSchema.replace(/--[^\n]*/g, "").replace(/\s+/g, " "));
});
beforeEach(async () => {
  await d1.exec(`DELETE FROM moderation_actions; DELETE FROM test_cases WHERE source = 'game'; DELETE FROM review_assignments;
    DELETE FROM reviews; DELETE FROM messages; DELETE FROM scores; DELETE FROM players;`);
  for (const name of ["elon_m", "alfie", "kai_music", "riley_reads", "rev_one", "rev_two", "rev_three"]) {
    await d1.prepare(`INSERT INTO players (id, name, normalized_name, token_hash, created_at, last_played_at)
      VALUES (?, ?, ?, 'hash', 0, 0)`).bind(name, name, normalizeUsername(name)).run();
  }
  await message("c1", "alfie", "anyone up for a round? call 555 123 4567");
  await message("c2", "kai_music", "elon_m always says that about alfie");
  await message("c3", "kai_music", "this one is off limits", "off_limits", "excluded");
  await message("m", "elon_m", "I am pro alfie, ask riley_reads", "passed", "pending", ["c1", "c3", "c2"]);
});

async function message(
  id: string, author: string, text: string | null, outcome = "passed", status = "pending", context: string[] = [],
) {
  const body = outcome === "off_limits" ? null : text;
  await d1.prepare(`INSERT INTO messages (id, author_id, text, masked_text, context_message_ids,
    filter_scores, filter_version, filter_outcome, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'v1', ?, ?, 1)`)
    .bind(id, author, body, body, JSON.stringify(context), SCORES, outcome, status).run();
}
let clock = 100;
async function vote(player: string, verdict: "fine" | "not_ok", reason: string | null = null, target = "m") {
  await d1.prepare(`INSERT INTO reviews (id, message_id, player_id, verdict, rule, reason, skipped, assignment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, 'queue', ?)`)
    .bind(crypto.randomUUID(), target, player, verdict, verdict === "not_ok" ? "sexual_content" : null, reason, clock++).run();
}
async function decide(status: string, target = "m") {
  await d1.prepare("UPDATE messages SET status = ? WHERE id = ?").bind(status, target).run();
}
async function cases() {
  return (await d1.prepare("SELECT * FROM test_cases WHERE source = 'game'").bind().all<TestCaseRow>()).results;
}

it("anonymizes usernames consistently across the message, context and reasons", async () => {
  await vote("rev_one", "not_ok", "'pro alfie' is a sexual joke about alfie by elon_m");
  await vote("rev_two", "fine");
  await vote("rev_three", "not_ok", "Innuendo aimed at a1fie, see kai_music's line");
  await decide("slip");

  expect(await captureTestCase(db, "m")).toBe("captured");
  const [row] = await cases();
  // Context order: alfie (A), kai_music (B), then the author elon_m (C), then riley_reads (D).
  expect(JSON.parse(row.context_snapshot)).toEqual([
    { sourceMessageId: "c1", username: "Player A", text: "anyone up for a round? call [redacted]" },
    { sourceMessageId: "c2", username: "Player B", text: "Player C always says that about Player A" },
  ]);
  expect(row.message).toBe("I am pro Player A, ask Player D");
  expect(JSON.parse(row.reasons)).toEqual([
    "'pro Player A' is a sexual joke about Player A by Player C",
    "Innuendo aimed at Player A, see Player B's line",
  ]);
  expect(row).toMatchObject({
    expected_verdict: "not_ok", rule: "sexual_content", source: "game",
    version_added: "v1", source_message_id: "m", filter_version: "v1", source_status: "slip",
  });
  expect(JSON.parse(row.filter_scores)).toEqual(JSON.parse(SCORES));
  // The deciding (latest) review's time, kept for patch timing after reviews expire.
  expect(row.confirmed_at).toBe(clock - 1);
  const stored = JSON.stringify(row);
  for (const name of ["elon", "alfie", "kai_music", "riley", "rev_", "555", "off limits"]) {
    expect(stored).not.toContain(name);
  }
});

it.each([
  ["clean", "passed", "fine"], ["false_positive", "blocked", "fine"], ["caught", "blocked", "not_ok"],
])("captures a %s verdict as %s / %s", async (status, outcome, expected) => {
  await message("t", "elon_m", "hi alfie", outcome, "pending", ["c1"]);
  await vote("rev_one", expected as "fine" | "not_ok", expected === "not_ok" ? "Bad" : null, "t");
  await vote("rev_two", expected as "fine" | "not_ok", expected === "not_ok" ? "Worse" : null, "t");
  await decide(status, "t");
  expect(await captureTestCase(db, "t")).toBe("captured");
  const [row] = await cases();
  expect(row).toMatchObject({
    expected_verdict: expected, rule: expected === "fine" ? null : "sexual_content", message: "hi Player A",
    source_status: status,
  });
  expect(JSON.parse(row.reasons)).toEqual(expected === "fine" ? [] : ["Bad", "Worse"]);
});

it("is idempotent, including concurrent captures", async () => {
  await vote("rev_one", "fine"); await vote("rev_two", "fine");
  await decide("clean");
  const results = await Promise.all(Array.from({ length: 5 }, () => captureTestCase(db, "m")));
  expect(results.filter((result) => result === "captured")).toHaveLength(1);
  expect(await captureTestCase(db, "m")).toBe("already_captured");
  expect(await cases()).toHaveLength(1);
});

it("captures exactly once when a submitted review completes the verdict", async () => {
  await vote("rev_one", "not_ok", "Joke about alfie");
  for (const id of ["rev_two", "rev_three"]) {
    await d1.prepare(`INSERT INTO review_assignments (id, player_id, message_id, assignment, created_at, expires_at)
      VALUES (?, ?, 'm', 'queue', 0, 9999999999)`).bind(id, id).run();
  }
  const submit = (id: string) => submitReview(db, { id, name: id, normalizedName: id }, {
    assignmentId: id, action: "not_ok", rule: "sexual_content", reason: `${id} agrees about elon_m`,
  });
  expect(await submit("rev_two")).toMatchObject({ ok: true });
  expect(await cases()).toHaveLength(1);
  expect(JSON.parse((await cases())[0].reasons)).toEqual(["Joke about Player A", "Player E agrees about Player C"]);
  expect(await submit("rev_three")).toMatchObject({ ok: false });
  expect(await cases()).toHaveLength(1);
});

it("does not capture pending, off-limits or maintainer-excluded messages", async () => {
  expect(await captureTestCase(db, "m")).toBe("pending");
  await vote("rev_one", "not_ok", "x", "c3"); await vote("rev_two", "not_ok", "x", "c3");
  expect(await captureTestCase(db, "c3")).toBe("ineligible");
  await decide("excluded");
  expect(await captureTestCase(db, "m")).toBe("ineligible");
  expect(await captureTestCase(db, "missing")).toBe("not_found");
  expect(await cases()).toHaveLength(0);
});

it("never captures a maintainer-deleted message", async () => {
  await vote("rev_one", "not_ok", "x"); await vote("rev_two", "not_ok", "x");
  await decide("slip");
  expect(await removeMessageAsMaintainer(db as unknown as MaintainerRemovalDatabase, "m", "maintainer@example.test"))
    .toEqual({ slipPointRemoved: true });
  expect(await captureTestCase(db, "m")).toBe("not_found");
  expect(await cases()).toHaveLength(0);
});

it("survives 90-day deletion of the source message, its context, reviews and players", async () => {
  await vote("rev_one", "not_ok", "Joke about alfie"); await vote("rev_two", "not_ok", "Same");
  await decide("slip");
  await captureTestCase(db, "m");
  const before = await cases();
  await d1.exec(`DELETE FROM reviews; DELETE FROM review_assignments; DELETE FROM messages;
    DELETE FROM scores; DELETE FROM players;`);
  expect(await cases()).toEqual(before);
  expect(before[0].message).toBe("I am pro Player A, ask Player D");
});

it("leaves seeds without a source message or filter results", async () => {
  const seed = await d1.prepare(`SELECT COUNT(*) AS n FROM test_cases
    WHERE source = 'seed' AND source_message_id IS NULL AND filter_scores IS NULL AND filter_version IS NULL
      AND source_status IS NULL`)
    .bind().first<{ n: number }>();
  expect(seed!.n).toBeGreaterThan(0);
  await expect(d1.prepare(`INSERT INTO test_cases (id, message, context_snapshot, expected_verdict, reasons, source, version_added)
    VALUES ('bad', 'x', '[]', 'fine', '[]', 'game', 'v1')`).bind().run()).rejects.toThrow();
});
