/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SEED_FIXTURES } from "@/lib/seeds";
import { GAME_TEST_CASES_SQL, gameTestCases, gameTestCasesFromExport, seedTestCases } from "./cases";

const { REVIEWS_TEST_DB: d1, CONSENSUS_SCHEMA: schema } = env as unknown as {
  REVIEWS_TEST_DB: {
    exec(sql: string): Promise<unknown>;
    prepare(sql: string): {
      bind(...values: unknown[]): { run(): Promise<unknown> };
      all<T>(): Promise<{ results: T[] }>;
    };
  };
  CONSENSUS_SCHEMA: string;
};

beforeAll(async () => {
  await d1.exec(schema.replace(/--[^\n]*/g, "").replace(/\s+/g, " "));
});
beforeEach(async () => {
  await d1.exec("DELETE FROM test_cases;");
  const insert = `INSERT INTO test_cases (id, message, context_snapshot, expected_verdict, rule, reasons, source,
    version_added, source_message_id, filter_scores, filter_version) VALUES (?, ?, ?, ?, ?, '[]', ?, 'v1', ?, ?, ?)`;
  const context = JSON.stringify([
    { username: "Player A", text: "hi" },
    { username: "Player B", text: "yo" },
    { username: "Player A", text: "again" },
  ]);
  await d1.prepare(insert).bind("g2", "pro Player B", context, "not_ok", "sexual_content", "game", "m2", "{}", "v1").run();
  await d1.prepare(insert).bind("g1", "hello all", "[]", "fine", null, "game", "m1", "{}", "v1").run();
  await d1.prepare(insert).bind("s1", "seed copy", "[]", "fine", null, "seed", null, null, null).run();
});

describe("game test cases", () => {
  it("loads only game cases from D1, in id order, with the context names as the room", async () => {
    const { results } = await d1.prepare(GAME_TEST_CASES_SQL).all<unknown>();
    expect(gameTestCases(results)).toEqual([
      {
        id: "g1", source: "game", text: "hello all", context: [], roomUsernames: [],
        expectedVerdict: "fine", rule: null,
      },
      {
        id: "g2",
        source: "game",
        text: "pro Player B",
        context: [
          { username: "Player A", text: "hi" },
          { username: "Player B", text: "yo" },
          { username: "Player A", text: "again" },
        ],
        roomUsernames: ["Player A", "Player B"],
        expectedVerdict: "not_ok",
        rule: "sexual_content",
      },
    ]);
  });

  it("reads wrangler --json exports and plain row arrays alike", async () => {
    const { results } = await d1.prepare(GAME_TEST_CASES_SQL).all<unknown>();
    const fromEnvelope = gameTestCasesFromExport([{ results, success: true, meta: {} }]);
    expect(fromEnvelope).toEqual(gameTestCases(results));
    expect(gameTestCasesFromExport(results)).toEqual(fromEnvelope);
    expect(gameTestCasesFromExport([{ results: [], success: true }])).toEqual([]);
    expect(() => gameTestCasesFromExport({ results })).toThrow(/JSON array/);
  });

  it("rejects malformed rows rather than guessing a label", () => {
    const row = { id: "x", message: "m", context_snapshot: "[]", expected_verdict: "fine", rule: null };
    expect(() => gameTestCases([{ ...row, expected_verdict: "maybe" }])).toThrow(/expected_verdict/);
    expect(() => gameTestCases([{ ...row, expected_verdict: "not_ok", rule: "toString" }])).toThrow(/unknown rule/);
    expect(() => gameTestCases([{ ...row, context_snapshot: '[{"username":"A"}]' }])).toThrow(/context_snapshot\[0\]/);
    expect(() => gameTestCases([{ ...row, message: undefined }])).toThrow(/missing/);
  });
});

it("maps every seed fixture to a seed case", () => {
  const cases = seedTestCases(SEED_FIXTURES);
  expect(cases).toHaveLength(SEED_FIXTURES.length);
  expect(cases.every((c) => c.source === "seed")).toBe(true);
  expect(cases[0]).toMatchObject({ id: SEED_FIXTURES[0].id, text: SEED_FIXTURES[0].text });
});
