/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it } from "vitest";
import { loadBoard } from "./index";

const { REVIEWS_TEST_DB: db, CONSENSUS_SCHEMA: schema } = env as unknown as {
  REVIEWS_TEST_DB: {
    exec(sql: string): Promise<unknown>;
    prepare(sql: string): { bind(...values: unknown[]): { run(): Promise<unknown>; all<T>(): Promise<{ results: T[]; success: boolean }> } };
  };
  CONSENSUS_SCHEMA: string;
};
const now = new Date("2026-10-15T23:59:59Z");
beforeAll(async () => {
  await db.exec(schema.replace(/--[^\n]*/g, "").replace(/\s+/g, " "));
  await db.exec("ALTER TABLE players ADD COLUMN banned_at INTEGER;");
});
beforeEach(async () => {
  await db.exec("DELETE FROM reviews; DELETE FROM messages; DELETE FROM scores; DELETE FROM players;");
});
async function player(id: string, name = id) {
  await db.prepare("INSERT INTO players (id, name, normalized_name, token_hash, created_at, last_played_at) VALUES (?, ?, ?, 'hash', 0, 0)").bind(id, name, id).run();
}
async function score(id: string, day: string, slips: number) {
  await db.prepare("INSERT INTO scores VALUES (?, ?, ?)").bind(id, day, slips).run();
}
it("sums exactly 90 UTC dates, excluding expired, future, zero, and banned scores", async () => {
  for (const id of ["a", "banned", "zero", "old"]) await player(id);
  await score("a", "2026-07-18", 2);
  await score("a", "2026-10-15", 3);
  await score("a", "2026-07-17", 100);
  await score("a", "2026-10-16", 100);
  await score("old", "2026-07-17", 100);
  await score("zero", "2026-10-15", 0);
  await score("banned", "2026-10-15", 100);
  await db.exec("UPDATE players SET banned_at = 1 WHERE id = 'banned';");
  expect(await loadBoard(db, now)).toEqual([{ name: "a", slips: 5 }]);
});
it("limits after sorting by count, binary name, and id, including ties at rank 50", async () => {
  for (let i = 54; i >= 0; i--) {
    const id = String(i).padStart(2, "0");
    await player(id, "same");
    await score(id, "2026-10-15", 1);
  }
  await player("winner", "zzz"); await score("winner", "2026-10-15", 2);
  await player("alpha", "Alpha"); await score("alpha", "2026-10-15", 1);
  const board = await loadBoard(db, now);
  expect(board).toHaveLength(50);
  expect(board).toEqual([{ name: "zzz", slips: 2 }, { name: "Alpha", slips: 1 }, ...Array.from({ length: 48 }, () => ({ name: "same", slips: 1 }))]);
});
it("returns an empty board without scores", async () => {
  expect(await loadBoard(db, now)).toEqual([]);
});
it("retains rule evidence and awarded points after a filter version patch", async () => {
  await player("author"); await player("judge");
  await db.exec(`INSERT INTO messages (id, author_id, text, masked_text, context_message_ids, filter_scores, filter_version, filter_outcome, created_at)
    VALUES ('m', 'author', 'synthetic', 'synthetic', '[]', '{}', 'v1',  'passed', 0);
    INSERT INTO reviews (id, message_id, player_id, verdict, rule, reason, assignment, created_at)
    VALUES ('r', 'm', 'judge', 'not_ok', 'profanity', 'synthetic reason', 'queue', 0);
    UPDATE messages SET status = 'slip' WHERE id = 'm';`.replace(/\s+/g, " "));
  const earned = await loadBoard(db);
  expect(earned).toEqual([{ name: "author", slips: 1 }]);
  await db.exec("UPDATE messages SET filter_version = 'v2' WHERE id = 'm';");
  expect(await loadBoard(db)).toEqual(earned);
  const evidence = await db.prepare("SELECT rule FROM reviews WHERE message_id = ?").bind("m").all<{ rule: string }>();
  expect(evidence.results).toEqual([{ rule: "profanity" }]);
});
