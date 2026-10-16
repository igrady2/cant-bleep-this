/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import wranglerConfig from "../../../wrangler.jsonc?raw";
import { loadBoard } from "@/lib/board";
import type { ReviewsDatabase } from "@/lib/reviews/db";
import { loadMessageReviewPresentation } from "@/lib/reviews/context";
import { retentionCutoffs, runRetention, type RetentionDatabase } from "./index";
import { handleRetentionCron } from "./scheduled";

const { REVIEWS_TEST_DB: d1, CONSENSUS_SCHEMA: schema, CLAIM_CAP_SCHEMA: claimCapSchema } = env as unknown as {
  REVIEWS_TEST_DB: {
    exec(sql: string): Promise<unknown>;
    prepare(sql: string): {
      bind(...values: unknown[]): {
        run(): Promise<{ meta: { changes: number } }>;
        first<T>(): Promise<T | null>;
        all<T>(): Promise<{ results: T[]; success: boolean }>;
      };
    };
  };
  CONSENSUS_SCHEMA: string;
  CLAIM_CAP_SCHEMA: string;
};
const db = d1 as unknown as RetentionDatabase;

const DAY = 24 * 60 * 60;
const now = new Date("2026-10-15T04:00:00Z");
const nowS = Math.floor(now.getTime() / 1000);
/** Unix seconds `days` days before `now`. */
const ago = (days: number) => nowS - days * DAY;

const compact = (sql: string) => sql.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");

beforeAll(async () => {
  await d1.exec(compact(schema));
  await d1.exec(compact(claimCapSchema));
});
beforeEach(async () => {
  await d1.exec(`DELETE FROM test_cases WHERE source = 'game'; DELETE FROM review_assignments;
    DELETE FROM reviews; DELETE FROM messages; DELETE FROM scores; DELETE FROM player_daily_posts;
    DELETE FROM site_daily_posts; DELETE FROM ip_daily_claims; DELETE FROM player_review_progress;
    DELETE FROM players;`.replace(/\s+/g, " "));
});

async function player(id: string, lastPlayedAt = nowS, createdAt = lastPlayedAt) {
  await d1.prepare(`INSERT INTO players (id, name, normalized_name, token_hash, created_at, last_played_at)
    VALUES (?, ?, ?, 'hash', ?, ?)`).bind(id, id, id, createdAt, lastPlayedAt).run();
}
async function message(id: string, author: string, createdAt: number, context: string[] = [], status = "pending") {
  await d1.prepare(`INSERT INTO messages (id, author_id, text, masked_text, context_message_ids,
    filter_scores, filter_version, filter_outcome, status, created_at)
    VALUES (?, ?, ?, ?, ?, '{}', 'v1', 'passed', ?, ?)`)
    .bind(id, author, `text ${id}`, `text ${id}`, JSON.stringify(context), status, createdAt).run();
}
async function review(id: string, messageId: string, reviewer: string, createdAt: number) {
  await d1.prepare(`INSERT INTO reviews (id, message_id, player_id, verdict, assignment, created_at)
    VALUES (?, ?, ?, 'fine', 'queue', ?)`).bind(id, messageId, reviewer, createdAt).run();
}
async function assignment(id: string, messageId: string, reviewer: string, createdAt: number) {
  await d1.prepare(`INSERT INTO review_assignments (id, player_id, message_id, assignment, created_at, expires_at)
    VALUES (?, ?, ?, 'queue', ?, ?)`).bind(id, reviewer, messageId, createdAt, createdAt + 600).run();
}
async function score(playerId: string, day: string, slips: number) {
  await d1.prepare("INSERT INTO scores (player_id, day, slips) VALUES (?, ?, ?)").bind(playerId, day, slips).run();
}
async function gameCase(id: string, sourceMessageId: string) {
  await d1.prepare(`INSERT INTO test_cases (id, message, context_snapshot, expected_verdict, rule, reasons,
    source, version_added, source_message_id, filter_scores, filter_version)
    VALUES (?, 'masked Player A', '[{"username":"Player B","text":"hi"}]', 'not_ok', 'profanity',
    '["reason"]', 'game', 'v1', ?, '{}', 'v1')`).bind(id, sourceMessageId).run();
}
async function ids(table: string, column = "id"): Promise<string[]> {
  const rows = await d1.prepare(`SELECT ${column} AS id FROM ${table} ORDER BY ${column}`).bind().all<{ id: string }>();
  return rows.results.map((row) => row.id);
}
async function count(sql: string): Promise<number> {
  return (await d1.prepare(sql).bind().first<{ n: number }>())!.n;
}

/** Rows that would be left pointing at a parent that no longer exists. */
async function orphans(): Promise<number> {
  return count(`SELECT
    (SELECT COUNT(*) FROM reviews r WHERE r.message_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.id = r.message_id))
    + (SELECT COUNT(*) FROM reviews r WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.id = r.player_id))
    + (SELECT COUNT(*) FROM review_assignments a WHERE a.message_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.id = a.message_id))
    + (SELECT COUNT(*) FROM review_assignments a WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.id = a.player_id))
    + (SELECT COUNT(*) FROM messages m WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.id = m.author_id))
    + (SELECT COUNT(*) FROM scores s WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.id = s.player_id))
    + (SELECT COUNT(*) FROM player_daily_posts d WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.id = d.player_id))
    + (SELECT COUNT(*) FROM messages m, json_each(m.context_message_ids) j
        WHERE NOT EXISTS (SELECT 1 FROM messages x WHERE x.id = j.value)) AS n`);
}

describe("retention cutoffs", () => {
  it("expires rows older than 90 days and keeps exactly the board's 90 score days", () => {
    expect(retentionCutoffs(now)).toEqual({ expiresBefore: nowS - 90 * DAY, firstKeptDay: "2026-07-18" });
  });
});

describe("runRetention", () => {
  it("removes expired messages with their reviews and assignments, and keeps recent ones", async () => {
    await player("author"); await player("judge");
    await message("old", "author", ago(91));
    await message("edge", "author", ago(90) + 1);
    await message("new", "author", ago(1));
    await review("r-old", "old", "judge", ago(89)); // a late review on an expired message
    await review("r-edge", "edge", "judge", ago(90) + 2);
    await review("r-new", "new", "judge", ago(1));
    await assignment("a-old", "old", "judge", ago(91));
    await assignment("a-new", "new", "judge", ago(1));

    const result = await runRetention(db, now);

    expect(await ids("messages")).toEqual(["edge", "new"]);
    expect(await ids("reviews")).toEqual(["r-edge", "r-new"]);
    expect(await ids("review_assignments")).toEqual(["a-new"]);
    expect(result.steps).toMatchObject({ expired_reviews: 1, expired_assignments: 1, expired_messages: 1 });
    expect(result.capped).toBe(false);
    expect(await orphans()).toBe(0);
  });

  it("removes expired seed-check reviews but never the test set", async () => {
    await player("author"); await player("judge");
    await message("old", "author", ago(120), [], "slip");
    await gameCase("case-old", "old");
    await d1.prepare(`INSERT INTO reviews (id, seed_case_id, player_id, verdict, seed_correct, assignment, created_at)
      VALUES ('seed-old', 'seed-fine-01', 'judge', 'fine', 1, 'queue', ?), ('seed-new', 'seed-fine-02', 'judge', 'fine', 1, 'queue', ?)`)
      .bind(ago(91), ago(1)).run();
    const testSet = await count("SELECT COUNT(*) AS n FROM test_cases");

    await runRetention(db, now);

    expect(await ids("messages")).toEqual([]);
    expect(await ids("reviews")).toEqual(["seed-new"]);
    expect(await count("SELECT COUNT(*) AS n FROM test_cases")).toBe(testSet);
    expect(await d1.prepare("SELECT message, context_snapshot, reasons FROM test_cases WHERE id = 'case-old'").bind().first())
      .toEqual({ message: "masked Player A", context_snapshot: '[{"username":"Player B","text":"hi"}]', reasons: '["reason"]' });
  });

  it("drops score and daily counter rows outside the board window and keeps the board unchanged", async () => {
    await player("a"); await player("b");
    await score("a", "2026-07-17", 100);
    await score("a", "2026-07-18", 2);
    await score("a", "2026-10-15", 3);
    await score("b", "2026-10-14", 0);
    await score("b", "2026-10-15", 1);
    await d1.prepare(`INSERT INTO player_daily_posts (player_id, day, post_count) VALUES ('a', '2026-07-17', 1), ('a', '2026-10-15', 1)`).bind().run();
    await d1.prepare(`INSERT INTO site_daily_posts (day, post_count) VALUES ('2026-07-17', 1), ('2026-10-15', 2)`).bind().run();
    await d1.prepare(`INSERT INTO ip_daily_claims (ip_hash, day, claim_count) VALUES ('h', '2026-07-17', 1), ('h', '2026-10-15', 1)`).bind().run();
    const board = await loadBoard(d1, now);

    await runRetention(db, now);

    expect(await ids("scores", "player_id || '/' || day")).toEqual(["a/2026-07-18", "a/2026-10-15", "b/2026-10-15"]);
    expect(await ids("player_daily_posts", "day")).toEqual(["2026-10-15"]);
    expect(await ids("site_daily_posts", "day")).toEqual(["2026-10-15"]);
    expect(await ids("ip_daily_claims", "day")).toEqual(["2026-10-15"]);
    expect(await loadBoard(d1, now)).toEqual(board);
    expect(board).toEqual([{ name: "a", slips: 5 }, { name: "b", slips: 1 }]);
  });

  it("releases a name 90 days after the claim when the player never posted", async () => {
    // claim.ts stores the claim time as the initial last_played_at.
    await player("never_posted", ago(91));
    await player("fresh_claim", ago(89));

    await runRetention(db, now);

    expect(await ids("players")).toEqual(["fresh_claim"]);
    // The released name can be claimed again.
    await player("never_posted");
    expect(await ids("players")).toEqual(["fresh_claim", "never_posted"]);
  });

  it("releases a name 90 days after its last post and keeps active and banned names", async () => {
    await player("idle", ago(91), ago(300));
    await player("active", ago(2), ago(300));
    await player("banned", ago(200), ago(300));
    await d1.exec("UPDATE players SET banned_at = 1 WHERE id = 'banned';");
    await message("idle-post", "idle", ago(91));
    await message("active-post", "active", ago(2), ["idle-post"]);
    // The idle player still judged recently; reviewing does not hold a name.
    await review("idle-judges", "active-post", "idle", ago(1));
    await assignment("idle-assigned", "active-post", "idle", ago(1));
    await review("active-judges", "idle-post", "active", ago(80));
    await score("idle", "2026-10-01", 2);
    await score("active", "2026-10-01", 1);
    await d1.prepare("INSERT INTO player_daily_posts (player_id, day, post_count) VALUES ('idle', '2026-10-15', 1)").bind().run();
    await d1.prepare("INSERT INTO player_review_progress (player_id, posts_since_review) VALUES ('idle', 1), ('active', 1)").bind().run();

    const result = await runRetention(db, now);

    expect(await ids("players")).toEqual(["active", "banned"]);
    expect(await ids("messages")).toEqual(["active-post"]);
    expect(await ids("reviews")).toEqual([]);
    expect(await ids("review_assignments")).toEqual([]);
    expect(await ids("scores", "player_id")).toEqual(["active"]);
    expect(await ids("player_review_progress", "player_id")).toEqual(["active"]);
    expect(await loadBoard(d1, now)).toEqual([{ name: "active", slips: 1 }]);
    expect(result.steps.released_players).toBe(1);
    expect(await orphans()).toBe(0);
  });

  it("prunes deleted ids from kept messages' context so nothing dangles", async () => {
    await player("author"); await player("judge");
    await message("c-old", "author", ago(95));
    await message("c-mid", "author", ago(85));
    await message("c-old2", "author", ago(91));
    await message("m", "author", ago(1), ["c-old", "c-mid", "c-old2"]);

    const result = await runRetention(db, now);

    const row = await d1.prepare("SELECT context_message_ids FROM messages WHERE id = 'm'").bind().first<{ context_message_ids: string }>();
    expect(JSON.parse(row!.context_message_ids)).toEqual(["c-mid"]);
    expect(result.steps.pruned_context).toBe(1);
    const presentation = await loadMessageReviewPresentation(d1 as unknown as ReviewsDatabase, "m");
    expect(presentation?.context.map((line) => line.text)).toEqual(["text c-mid"]);
    expect(await orphans()).toBe(0);
  });

  it("deletes in LIMITed batches, stops at the per-run cap, and finishes on later runs", async () => {
    await player("author");
    for (let i = 0; i < 9; i++) await message(`old-${i}`, "author", ago(100 + i));
    await message("keep", "author", ago(1));
    const statements: string[] = [];
    const counted: RetentionDatabase = {
      prepare(sql) {
        statements.push(sql);
        return d1.prepare(sql);
      },
    };

    const first = await runRetention(counted, now, { batchSize: 2, maxRowsPerRun: 5 });
    expect(first).toMatchObject({ total: 5, capped: true });
    expect(await count("SELECT COUNT(*) AS n FROM messages")).toBe(5);
    expect(statements.every((sql) => /LIMIT \?/.test(sql))).toBe(true);
    // Two full batches, then one batch of the single row left in the budget.
    expect(statements.filter((sql) => sql.startsWith("DELETE FROM messages"))).toHaveLength(3);

    const second = await runRetention(db, now, { batchSize: 2, maxRowsPerRun: 5 });
    expect(second).toMatchObject({ total: 4, capped: false });
    expect(await ids("messages")).toEqual(["keep"]);
  });

  it("is a no-op when nothing has expired", async () => {
    await player("author");
    await message("new", "author", ago(1));
    await runRetention(db, now);
    expect(await runRetention(db, now)).toMatchObject({ total: 0, capped: false });
    expect(await ids("messages")).toEqual(["new"]);
  });
});

describe("nightly cron", () => {
  it("is configured in wrangler and served by the custom worker entry", () => {
    expect(wranglerConfig).toMatch(/"main": "custom-worker\.ts"/);
    expect(wranglerConfig).toMatch(/"triggers": \{\s*"crons": \["0 4 \* \* \*"\]/);
  });

  it("runs retention at the scheduled time and hands the work to waitUntil", async () => {
    await player("idle", ago(91));
    await player("recent", ago(10));
    const waitUntil = vi.fn();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await handleRetentionCron(
      { cron: "0 4 * * *", scheduledTime: now.getTime() },
      { DB: db },
      { waitUntil },
    );
    expect(waitUntil).toHaveBeenCalledOnce();
    expect(await ids("players")).toEqual(["recent"]);
    expect(log).toHaveBeenCalledWith("[retention]", "0 4 * * *", expect.stringContaining('"released_players":1'));
    log.mockRestore();
  });

  it("logs and skips when the database binding is missing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const waitUntil = vi.fn();
    await handleRetentionCron({ cron: "0 4 * * *", scheduledTime: now.getTime() }, {}, { waitUntil });
    expect(waitUntil).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("[retention] DB binding missing");
    error.mockRestore();
  });
});
