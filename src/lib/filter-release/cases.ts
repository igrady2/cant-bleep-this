import "server-only";

import { CATEGORIES, type CategoryId } from "@/lib/moderation/categories";
import type { SeedFixture } from "@/lib/seeds/types";

/** One labeled case from the permanent test set, as the release runner sees it. */
export interface FilterTestCase {
  id: string;
  source: "seed" | "game";
  text: string;
  context: { username: string; text: string }[];
  roomUsernames: string[];
  expectedVerdict: "fine" | "not_ok";
  /** The deciding reviewers' rule; null for fine cases and for slips captured without one. */
  rule: CategoryId | null;
}

/**
 * Game-derived cases (#22). Seeds come from fixtures/seeds.json instead. Export
 * with `npx wrangler d1 execute cant-bleep-this --remote --json --command "<this>"`.
 */
export const GAME_TEST_CASES_SQL =
  "SELECT id, message, context_snapshot, expected_verdict, rule FROM test_cases WHERE source = 'game' ORDER BY id";

export function seedTestCases(fixtures: readonly SeedFixture[]): FilterTestCase[] {
  return fixtures.map((fixture) => ({
    id: fixture.id,
    source: "seed",
    text: fixture.text,
    context: fixture.context,
    roomUsernames: fixture.roomUsernames,
    expectedVerdict: fixture.expectedVerdict,
    rule: fixture.rule,
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseContext(id: string, raw: string): FilterTestCase["context"] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`Test case ${id}: context_snapshot is not an array`);
  return parsed.map((line, index) => {
    if (!isRecord(line) || typeof line.username !== "string" || typeof line.text !== "string") {
      throw new Error(`Test case ${id}: context_snapshot[${index}] needs a username and text`);
    }
    return { username: line.username, text: line.text };
  });
}

/** Validates exported rows. Stand-in names in the context make up the room. */
export function gameTestCases(rows: readonly unknown[]): FilterTestCase[] {
  return rows.map((row, index) => {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.message !== "string"
      || typeof row.context_snapshot !== "string") {
      throw new Error(`Game test case row ${index} is missing id, message or context_snapshot`);
    }
    const id = row.id;
    const verdict = row.expected_verdict;
    const rule = row.rule;
    if (verdict !== "fine" && verdict !== "not_ok") {
      throw new Error(`Test case ${id}: unknown expected_verdict`);
    }
    if (rule !== null && rule !== undefined && !CATEGORIES.some((c) => c.id === rule)) {
      throw new Error(`Test case ${id}: unknown rule`);
    }
    const context = parseContext(id, row.context_snapshot);
    return {
      id,
      source: "game",
      text: row.message,
      context,
      roomUsernames: [...new Set(context.map((line) => line.username))],
      expectedVerdict: verdict,
      rule: verdict === "not_ok" ? ((rule as CategoryId | null | undefined) ?? null) : null,
    };
  });
}

/** Accepts `wrangler d1 execute --json` output (an array of result envelopes) or a plain row array. */
export function gameTestCasesFromExport(json: unknown): FilterTestCase[] {
  if (!Array.isArray(json)) throw new Error("Game test case export must be a JSON array");
  const envelopes = json.every((entry) => isRecord(entry) && Array.isArray(entry.results));
  const rows = envelopes && json.length > 0
    ? json.flatMap((entry) => (entry as { results: unknown[] }).results)
    : json;
  return gameTestCases(rows);
}
