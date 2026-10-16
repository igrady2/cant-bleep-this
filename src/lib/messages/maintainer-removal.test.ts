/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it } from "vitest";
import { banPlayerAsMaintainer } from "@/lib/admin/moderation";
import { loadBoard } from "@/lib/board";
import { authenticatePlayerToken } from "@/lib/players/auth";
import { hashPlayerToken } from "@/lib/players/crypto";
import type { PlayersDatabase } from "@/lib/players/db";
import { loadMessageReviewPresentation } from "@/lib/reviews/context";
import { captureTestCase } from "@/lib/test-cases/capture";
import { listQueueCandidates } from "@/lib/reviews/queue";
import { loadPublicFeed } from "./feed";
import { removeMessageAsMaintainer } from "./maintainer-removal";
import type { MessagesDatabase } from "./db";
const bindings = env as unknown as {
  REVIEWS_TEST_DB: {
    exec(sql: string): Promise<unknown>;
    prepare(sql: string): {
      bind(...values: unknown[]): ReturnType<typeof d1.prepare>;
      run(): Promise<unknown>;
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[]; success: boolean }>;
    };
  }; CONSENSUS_SCHEMA: string; ADMIN_MODERATION_SCHEMA: string; CLAIM_CAP_SCHEMA: string;
};
const d1 = bindings.REVIEWS_TEST_DB;
const db = d1 as unknown as MessagesDatabase;
beforeAll(async () => {
  for (const schema of [bindings.CONSENSUS_SCHEMA, bindings.CLAIM_CAP_SCHEMA, bindings.ADMIN_MODERATION_SCHEMA]) {
    await d1.exec(schema.replace(/--[^\n]*/g, "").replace(/\s+/g, " "));
  }
});
beforeEach(async () => {
  await d1.exec("DELETE FROM moderation_actions; DELETE FROM test_cases WHERE source = 'game'; DELETE FROM review_assignments; DELETE FROM reviews; DELETE FROM messages; DELETE FROM scores; DELETE FROM players;");
  await d1.prepare("INSERT INTO players (id, name, normalized_name, token_hash, created_at, last_played_at) VALUES ('p', 'alice', 'alice', ?, 0, 0)").bind(await hashPlayerToken("token")).run();
  for (const id of ["m", "other"]) {
    await d1.prepare(`INSERT INTO messages (id, author_id, text, masked_text, context_message_ids, filter_scores, filter_version, filter_outcome, created_at)
      VALUES (?, 'p', 'synthetic', 'synthetic', '[]', '{}', 'v1', 'passed', 1)`).bind(id).run();
  }
});
async function points() {
  return (await d1.prepare("SELECT COALESCE(SUM(slips), 0) AS n FROM scores").first<{ n: number }>())!.n;
}
it("deletes once, reverses its award, drops its case and scrubs other context", async () => {
  await d1.exec(`UPDATE messages SET status = 'slip'; UPDATE messages SET context_message_ids = '["m"]' WHERE id = 'other'; INSERT INTO scores VALUES ('p', '2000-01-01', 7);`);
  expect(await captureTestCase(db, "m")).toBe("captured");
  expect(await captureTestCase(db, "other")).toBe("captured");
  expect(await removeMessageAsMaintainer(db, "m", "maintainer")).toEqual({ slipPointRemoved: true });
  expect(await removeMessageAsMaintainer(db, "m", "other")).toBe("not_found");
  expect(await points()).toBe(8);
  expect(await d1.prepare("SELECT actor FROM moderation_actions").all()).toMatchObject({ results: [{ actor: "maintainer" }] });
  expect(await d1.prepare("SELECT id FROM messages WHERE id = 'm'").first()).toBeNull();
  expect(await d1.prepare("SELECT context_message_ids, status FROM messages WHERE id = 'other'").first()).toEqual({ context_message_ids: "[]", status: "slip" });
  expect(await d1.prepare("SELECT context_snapshot FROM test_cases WHERE source_message_id = 'other'").first()).toEqual({ context_snapshot: "[]" });
  expect(await d1.prepare("SELECT id FROM test_cases WHERE source_message_id = 'm'").first()).toBeNull();
  expect(await captureTestCase(db, "m")).toBe("not_found");
  expect(await loadMessageReviewPresentation(db, "m")).toBeNull();
  expect((await loadPublicFeed(db)).map((message) => message.id)).toEqual(["other"]);
});
it("removes pending messages and outstanding assignments from the queue", async () => {
  await d1.prepare(`INSERT INTO review_assignments (id, player_id, message_id, assignment, created_at, expires_at)
    VALUES ('a', 'p', 'm', 'queue', 1, 9999999999)`).run();
  await removeMessageAsMaintainer(db, "m", "maintainer");
  expect(await d1.prepare("SELECT id FROM review_assignments WHERE id = 'a'").first()).toBeNull();
  const candidates = await listQueueCandidates(db, { id: "reviewer", name: "reviewer", normalizedName: "reviewer" });
  expect(candidates.map((message) => message.id)).toEqual(["other"]);
});
it("drops legacy context snapshots identified by a live source", async () => {
  await d1.exec(`UPDATE messages SET status = 'clean', context_message_ids = '["m"]' WHERE id = 'other';`);
  await captureTestCase(db, "other");
  await d1.exec(`UPDATE test_cases SET context_snapshot = '[{"username":"Player A","text":"legacy text"}]' WHERE source_message_id = 'other';`);
  await removeMessageAsMaintainer(db, "m", "maintainer");
  expect(await d1.prepare("SELECT context_snapshot FROM test_cases WHERE source_message_id = 'other'").first()).toEqual({ context_snapshot: "[]" });
});
it.each(["pending", "clean", "caught", "false_positive"])("deleting %s preserves other points", async (status) => {
  await d1.exec("UPDATE messages SET status = 'slip' WHERE id = 'other'");
  await d1.prepare("UPDATE messages SET status = ? WHERE id = 'm'").bind(status).run();
  await removeMessageAsMaintainer(db, "m", "maintainer");
  await removeMessageAsMaintainer(db, "m", "maintainer");
  expect(await points()).toBe(1);
});
it("bans once, rejects its token, hides its board entry and preserves cases and points", async () => {
  await d1.exec("UPDATE messages SET status = 'slip' WHERE id = 'm'");
  await captureTestCase(db, "m");
  const cases = await d1.prepare("SELECT * FROM test_cases").all();
  expect((await authenticatePlayerToken(d1 as unknown as PlayersDatabase, "token")).ok).toBe(true);
  expect(await loadBoard(d1)).toEqual([{ name: "alice", slips: 1 }]);
  expect(await banPlayerAsMaintainer(db, "p", "maintainer")).toBe(true);
  const first = await d1.prepare("SELECT banned_at FROM players WHERE id = 'p'").first();
  expect(await banPlayerAsMaintainer(db, "p", "other")).toBe(true);
  expect(await d1.prepare("SELECT banned_at FROM players WHERE id = 'p'").first()).toEqual(first);
  expect(await authenticatePlayerToken(d1 as unknown as PlayersDatabase, "token")).toMatchObject({ ok: false, status: 403 });
  expect(await loadBoard(d1)).toEqual([]);
  expect((await d1.prepare("SELECT * FROM test_cases").all()).results).toEqual(cases.results);
  expect(await points()).toBe(1);
  expect(await d1.prepare("SELECT status FROM messages WHERE id = 'm'").first()).toEqual({ status: "slip" });
  expect(await d1.prepare("SELECT actor FROM moderation_actions").all()).toMatchObject({ results: [{ actor: "maintainer" }] });
});
it("requires a verified actor before writes", async () => {
  await expect(removeMessageAsMaintainer(db, "m", " ")).rejects.toThrow("identity");
  await expect(banPlayerAsMaintainer(db, "p", "")).rejects.toThrow("identity");
});
