/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it } from "vitest";
import type { MessagesDatabase } from "@/lib/messages/db";
import { loadTriage, setTriageTags, TRIAGE_LIMIT } from "./triage";

const { REVIEWS_TEST_DB: d1, CONSENSUS_SCHEMA: schema } = env as unknown as {
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
};
const db = d1 as unknown as MessagesDatabase;

beforeAll(async () => {
  await d1.exec(schema.replace(/--[^\n]*/g, "").replace(/\s+/g, " "));
});
beforeEach(async () => {
  await d1.exec("DELETE FROM triage_tags; DELETE FROM test_cases WHERE source = 'game';");
});

interface CaseInput {
  id: string;
  status: "slip" | "caught" | "clean" | "false_positive";
  rule?: string | null;
  message?: string;
  context?: { username: string; text: string }[];
  reasons?: string[];
  scores?: Record<string, number>;
}

async function testCase({ id, status, rule = null, message = "synthetic", context = [], reasons = [], scores = { profanity: 0.1 } }: CaseInput) {
  const verdict = status === "slip" || status === "caught" ? "not_ok" : "fine";
  await d1.prepare(`INSERT INTO test_cases (id, message, context_snapshot, expected_verdict, rule, reasons,
      source, version_added, source_message_id, filter_scores, filter_version, source_status)
    VALUES (?, ?, ?, ?, ?, ?, 'game', 'v1', ?, ?, 'v1', ?)`)
    .bind(id, message, JSON.stringify(context), verdict, rule, JSON.stringify(reasons), `msg-${id}`, JSON.stringify(scores), status)
    .run();
}

it("groups slips by the reviewers' rule in policy order, newest first", async () => {
  await testCase({ id: "s1", status: "slip", rule: "profanity", message: "sh1t happens" });
  await testCase({ id: "s2", status: "slip", rule: "bullying_harassment" });
  await testCase({ id: "s3", status: "slip", rule: "profanity", message: "newer" });
  await testCase({ id: "s4", status: "slip", rule: null });
  const view = await loadTriage(db, "slip");
  expect(view.kind).toBe("slip");
  expect(view.groups.map((group) => [group.rule, group.label, group.items.map((item) => item.id)])).toEqual([
    ["bullying_harassment", "Harassment", ["s2"]],
    ["profanity", "Profanity", ["s3", "s1"]],
    ["unknown", "No rule recorded", ["s4"]],
  ]);
});

it("groups false positives by the reviewable rule the filter scored highest", async () => {
  await testCase({ id: "f1", status: "false_positive", scores: { off_limits: 0.9, sexual_content: 0.7, profanity: 0.2 } });
  await testCase({ id: "f2", status: "false_positive", scores: { profanity: 0.8, spam: 0.6 } });
  const view = await loadTriage(db, "false_positive");
  expect(view.groups.map((group) => [group.rule, group.items.map((item) => item.id)])).toEqual([
    ["sexual_content", ["f1"]],
    ["profanity", ["f2"]],
  ]);
  expect(view.groups[0].items[0].scores).toEqual([
    { rule: "off_limits", label: "Off-limits", score: 0.9 },
    { rule: "sexual_content", label: "Sexual content", score: 0.7 },
    { rule: "profanity", label: "Profanity", score: 0.2 },
  ]);
});

it("counts both lists and leaves out caught, clean and seed cases", async () => {
  await testCase({ id: "s1", status: "slip", rule: "spam" });
  await testCase({ id: "f1", status: "false_positive" });
  await testCase({ id: "f2", status: "false_positive" });
  await testCase({ id: "c1", status: "caught", rule: "spam" });
  await testCase({ id: "c2", status: "clean" });
  const slips = await loadTriage(db, "slip");
  expect(slips.counts).toEqual({ slip: 1, false_positive: 2 });
  expect(slips.groups.flatMap((group) => group.items.map((item) => item.id))).toEqual(["s1"]);
  const falsePositives = await loadTriage(db, "false_positive");
  expect(falsePositives.groups.flatMap((group) => group.items.map((item) => item.id)).sort()).toEqual(["f1", "f2"]);
  expect(JSON.stringify([slips, falsePositives])).not.toContain("seed-");
});

it("returns only safe, re-masked fields with filter version and reasons", async () => {
  await testCase({
    id: "s1", status: "slip", rule: "personal_info",
    message: "mail me at someone@example.test or 555 123 4567",
    context: [{ username: "Player A", text: "call 787 555 0100" }],
    reasons: ["Player B shared a@b.example"],
  });
  const [item] = (await loadTriage(db, "slip")).groups[0].items;
  expect(Object.keys(item).sort()).toEqual(["context", "filterVersion", "id", "message", "reasons", "scores", "tags", "versionAdded"]);
  expect(item.message).toBe("mail me at [redacted] or [redacted]");
  expect(item.context).toEqual([{ username: "Player A", text: "call [redacted]" }]);
  expect(item.reasons).toEqual(["Player B shared [redacted]"]);
  expect(item).toMatchObject({ filterVersion: "v1", versionAdded: "v1", tags: [] });
  expect(JSON.stringify(item)).not.toContain("msg-s1");
});

it("bounds each list", async () => {
  for (let i = 0; i <= TRIAGE_LIMIT; i++) await testCase({ id: `s${i}`, status: "slip", rule: "spam" });
  const view = await loadTriage(db, "slip");
  expect(view.groups[0].items).toHaveLength(TRIAGE_LIMIT);
  expect(view.counts.slip).toBe(TRIAGE_LIMIT + 1);
});

it("replaces tags in canonical order and shows them on the item", async () => {
  await testCase({ id: "s1", status: "slip", rule: "profanity" });
  expect(await setTriageTags(db, "s1", ["meaning", "spelling", "meaning"], 10)).toEqual({ ok: true, tags: ["spelling", "meaning"] });
  expect((await loadTriage(db, "slip")).groups[0].items[0].tags).toEqual(["spelling", "meaning"]);
  expect(await setTriageTags(db, "s1", ["context"], 11)).toEqual({ ok: true, tags: ["context"] });
  expect((await loadTriage(db, "slip")).groups[0].items[0].tags).toEqual(["context"]);
  expect(await setTriageTags(db, "s1", [], 12)).toEqual({ ok: true, tags: [] });
  expect((await loadTriage(db, "slip")).groups[0].items[0].tags).toEqual([]);
});

it("tags false positives too, but not caught or clean cases", async () => {
  await testCase({ id: "f1", status: "false_positive" });
  await testCase({ id: "c1", status: "caught", rule: "spam" });
  expect(await setTriageTags(db, "f1", ["sound"])).toEqual({ ok: true, tags: ["sound"] });
  expect(await setTriageTags(db, "c1", ["sound"])).toMatchObject({ ok: false, status: 404 });
  expect(await setTriageTags(db, "seed-fine-01", ["sound"])).toMatchObject({ ok: false, status: 404 });
  expect(await setTriageTags(db, "missing", ["sound"])).toMatchObject({ ok: false, status: 404 });
});

it("rejects unknown tags and bad ids", async () => {
  await testCase({ id: "s1", status: "slip", rule: "spam" });
  for (const tags of [["leet"], "spelling", null, [1], ["spelling", "sound", "meaning", "context", "spelling"]]) {
    expect(await setTriageTags(db, "s1", tags)).toMatchObject({ ok: false, status: 400 });
  }
  for (const id of [undefined, "", 42, "x".repeat(101)]) {
    expect(await setTriageTags(db, id, ["spelling"])).toMatchObject({ ok: false, status: 400 });
  }
});

it("rejects tags outside the schema and drops tags with their case", async () => {
  await testCase({ id: "s1", status: "slip", rule: "spam" });
  await expect(d1.prepare("INSERT INTO triage_tags VALUES ('s1', 'leet', 0)").bind().run()).rejects.toThrow();
  await setTriageTags(db, "s1", ["spelling"]);
  await d1.exec("DELETE FROM test_cases WHERE id = 's1';");
  expect((await d1.prepare("SELECT COUNT(*) AS n FROM triage_tags").bind().first<{ n: number }>())!.n).toBe(0);
});

it("rejects a status on seeds or outside the decided set", async () => {
  await expect(d1.prepare("UPDATE test_cases SET source_status = 'slip' WHERE id = 'seed-fine-01'").bind().run()).rejects.toThrow();
  await testCase({ id: "s1", status: "slip", rule: "spam" });
  await expect(d1.prepare("UPDATE test_cases SET source_status = 'pending' WHERE id = 's1'").bind().run()).rejects.toThrow();
});
