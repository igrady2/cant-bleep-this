/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { MessagesDatabase } from "@/lib/messages/db";
import { CATEGORIES, type CategoryId } from "@/lib/moderation/categories";
import { filterFingerprint, filterVersion, type FilterConfig } from "@/lib/moderation/filter-versions";
import type { FilterTestCase } from "./cases";
import { evaluateFilterRelease, type FilterReleaseReport, type FilterScoreFn } from "./evaluate";
import {
  PATCH_TIME_TARGET_SECONDS,
  loadPatchedVersions,
  loadPublicReleases,
  loadReleases,
  parseReleaseReport,
  recordFilterRelease,
} from "./releases";

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
/** D1 exec runs one statement per line. */
const exec = (sql: string) => d1.exec(sql.replace(/\s+/g, " "));

const DAY = 24 * 60 * 60;
const v1 = filterVersion("v1");
/** A looser predecessor: v1's questions with a 0.9 profanity threshold. */
const v0: FilterConfig = {
  ...v1,
  id: "v0",
  thresholds: { ...v1.thresholds, rules: { ...v1.thresholds.rules, profanity: 0.9 } },
};

const PROFANITY: Record<string, number> = {
  "tc-slip-new": 0.7, // v1 catches, v0 missed: newly patched
  "tc-slip-old": 0.95, // both catch
  "tc-slip-missed": 0.1, // neither catches
  "tc-caught": 0.95, // blocked at the time, never a slip
  "tc-fine": 0.1,
  "seed-fine": 0.1,
};
const score: FilterScoreFn = async (testCase) => ({
  model: "jev-test",
  scores: {
    ...(Object.fromEntries(CATEGORIES.map((c) => [c.id, 0.02])) as Record<CategoryId, number>),
    profanity: PROFANITY[testCase.id],
  },
  offLimitsScore: 0.02,
});
const testCase = (
  id: string, expectedVerdict: "fine" | "not_ok", source: "seed" | "game" = "game",
): FilterTestCase => ({
  id, source, text: `text ${id}`, context: [], roomUsernames: [], expectedVerdict,
  rule: expectedVerdict === "not_ok" ? "profanity" : null,
});

let report: FilterReleaseReport;
let now: number;

beforeAll(async () => {
  await d1.exec(schema.replace(/--[^\n]*/g, "").replace(/\s+/g, " "));
  report = await evaluateFilterRelease([
    testCase("tc-slip-new", "not_ok"),
    testCase("tc-slip-old", "not_ok"),
    testCase("tc-slip-missed", "not_ok"),
    testCase("tc-caught", "not_ok"),
    testCase("tc-fine", "fine"),
    testCase("seed-fine", "fine", "seed"),
  ], v0, v1, score);
  now = Math.floor(Date.parse(report.generatedAt) / 1000) + DAY;
});

async function gameCase(id: string, status: "slip" | "caught" | "clean", confirmedAt: number | null) {
  await d1.prepare(`INSERT INTO test_cases (id, message, context_snapshot, expected_verdict, rule, reasons,
      source, version_added, source_message_id, filter_scores, filter_version, source_status, confirmed_at)
    VALUES (?, 'masked', '[]', ?, ?, '[]', 'game', 'v0', ?, '{}', 'v0', ?, ?)`)
    .bind(id, status === "clean" ? "fine" : "not_ok", status === "clean" ? null : "profanity", `msg-${id}`, status, confirmedAt)
    .run();
}

beforeEach(async () => {
  await d1.exec(`DELETE FROM patched_slips; DELETE FROM filter_releases; DELETE FROM test_cases WHERE source = 'game';
    DELETE FROM scores; DELETE FROM players;`);
  await gameCase("tc-slip-new", "slip", now - 3 * DAY);
  await gameCase("tc-slip-old", "slip", null);
  await gameCase("tc-slip-missed", "slip", now - DAY);
  await gameCase("tc-caught", "caught", now - DAY);
  await gameCase("tc-fine", "clean", now - DAY);
  await d1.prepare(`INSERT INTO players (id, name, normalized_name, token_hash, created_at, last_played_at)
    VALUES ('p1', 'Alice', 'alice', 'hash', 1, 1)`).bind().run();
  await d1.prepare("INSERT INTO scores (player_id, day, slips) VALUES ('p1', '2026-10-01', 3)").bind().run();
});

const patches = async () => (await d1.prepare(
  "SELECT test_case_id, version, confirmed_at, released_at, patch_seconds FROM patched_slips ORDER BY test_case_id",
).bind().all()).results;

describe("recordFilterRelease", () => {
  it("records a gate-passing release of the active version with its release time", async () => {
    const result = await recordFilterRelease(db, JSON.parse(JSON.stringify(report)), now);
    expect(result).toEqual({
      ok: true,
      release: {
        version: "v1",
        releasedAt: now,
        baselineVersion: "v0",
        catches: 3,
        baselineCatches: 2,
        falsePositives: 0,
        baselineFalsePositives: 0,
        patchedSlips: 2,
        patchTime: { measured: 1, medianSeconds: 3 * DAY, withinTarget: 1 },
      },
    });
    const row = await d1.prepare("SELECT * FROM filter_releases").bind().first<Record<string, unknown>>();
    expect(row).toMatchObject({
      version: "v1",
      released_at: now,
      config_fingerprint: await filterFingerprint(v1),
      test_set_fingerprint: report.testSet.fingerprint,
    });
  });

  it("marks only confirmed slips the release catches, with patch timing", async () => {
    await recordFilterRelease(db, report, now);
    expect(await patches()).toEqual([
      { test_case_id: "tc-slip-new", version: "v1", confirmed_at: now - 3 * DAY, released_at: now, patch_seconds: 3 * DAY },
      { test_case_id: "tc-slip-old", version: "v1", confirmed_at: null, released_at: now, patch_seconds: null },
    ]);
  });

  it("never changes players' points", async () => {
    await recordFilterRelease(db, report, now);
    expect((await d1.prepare("SELECT player_id, day, slips FROM scores").bind().all()).results)
      .toEqual([{ player_id: "p1", day: "2026-10-01", slips: 3 }]);
  });

  it("keeps the first release that patched a slip and unmarks slips the new version lets through", async () => {
    await exec(`INSERT INTO filter_releases (version, released_at, baseline_version, config_fingerprint,
        test_set_fingerprint, baseline_catches, catches, baseline_false_positives, false_positives)
      VALUES ('v0', ${now - 2 * DAY}, 'v-1', 'f', 't', 0, 1, 0, 0);
      INSERT INTO patched_slips (test_case_id, version, confirmed_at, released_at, patch_seconds)
      VALUES ('tc-slip-old', 'v0', NULL, ${now - 2 * DAY}, NULL), ('tc-slip-missed', 'v0', NULL, ${now - 2 * DAY}, NULL);`);
    await recordFilterRelease(db, report, now);
    expect((await patches()).map((p) => [p.test_case_id, p.version])).toEqual([
      ["tc-slip-new", "v1"],
      ["tc-slip-old", "v0"],
    ]);
  });

  it("refuses to record the same version twice", async () => {
    await recordFilterRelease(db, report, now);
    expect(await recordFilterRelease(db, report, now + 1)).toEqual({
      ok: false, status: 409, error: "Filter version v1 is already released.",
    });
  });

  it("refuses a report whose gate failed", async () => {
    const failed = { ...report, gate: { passed: false, reasons: ["Catches must rise: 2 -> 2."] } };
    expect(await recordFilterRelease(db, failed, now)).toMatchObject({ ok: false, status: 400 });
    expect(await patches()).toEqual([]);
  });

  it("re-runs the gate on the cases instead of trusting the report's verdict", async () => {
    const tampered = {
      ...report,
      cases: report.cases.map((c) => (c.id === "tc-slip-new" ? { ...c, candidate: c.baseline } : c)),
    };
    const result = await recordFilterRelease(db, tampered, now);
    expect(result).toMatchObject({ ok: false, status: 422 });
    expect(!result.ok && result.error).toContain("Catches must rise: 2 -> 2.");
  });

  it("only releases the version this deployment runs, as it was gated", async () => {
    expect(await recordFilterRelease(db, report, now, "v2")).toMatchObject({ ok: false, status: 422 });
    const edited = { ...report, candidate: { ...report.candidate, fingerprint: "edited" } };
    expect(await recordFilterRelease(db, edited, now)).toMatchObject({ ok: false, status: 422 });
    const unknown = { ...report, candidate: { ...report.candidate, id: "v9" } };
    expect(await recordFilterRelease(db, unknown, now, "v9")).toMatchObject({
      ok: false, status: 422, error: "Filter version v9 is not registered.",
    });
  });

  it("refuses a release time before the report was generated", async () => {
    expect(await recordFilterRelease(db, report, now - 2 * DAY)).toMatchObject({ ok: false, status: 422 });
  });

  it.each([null, [], { reportVersion: 2 }, { ...{}, reportVersion: 1 }])("rejects a body that is not a report: %j", async (body) => {
    expect(await recordFilterRelease(db, body, now)).toMatchObject({ ok: false, status: 400 });
  });
});

describe("parseReleaseReport", () => {
  it("rejects duplicate and malformed cases", () => {
    expect(parseReleaseReport({ ...report, cases: [report.cases[0], report.cases[0]] }))
      .toBe(`The report lists case ${report.cases[0].id} twice.`);
    expect(parseReleaseReport({ ...report, cases: [{ id: "x" }] }))
      .toBe("Every report case needs an id, source, expected verdict and both results.");
  });
});

describe("release readers", () => {
  it("summarizes patch time against the two-week target", async () => {
    await exec(`INSERT INTO filter_releases (version, released_at, baseline_version, config_fingerprint,
        test_set_fingerprint, baseline_catches, catches, baseline_false_positives, false_positives)
      VALUES ('v2', ${now}, 'v1', 'f', 't', 1, 3, 2, 2);
      INSERT INTO patched_slips (test_case_id, version, confirmed_at, released_at, patch_seconds) VALUES
      ('tc-slip-new', 'v2', 1, ${now}, ${DAY}), ('tc-slip-old', 'v2', 1, ${now}, ${3 * DAY}),
      ('tc-slip-missed', 'v2', 1, ${now}, ${PATCH_TIME_TARGET_SECONDS + 1}), ('tc-caught', 'v2', NULL, ${now}, NULL);`);
    const [release] = await loadReleases(db);
    expect(release).toMatchObject({ version: "v2", patchedSlips: 4 });
    expect(release.patchTime).toEqual({ measured: 3, medianSeconds: 3 * DAY, withinTarget: 2 });
    expect(await loadPublicReleases(db)).toEqual([{ version: "v2", releasedAt: now, patchedSlips: 4 }]);
  });

  it("maps live slip messages to the release that patched them", async () => {
    await recordFilterRelease(db, report, now);
    const patched = await loadPatchedVersions(db, ["msg-tc-slip-new", "msg-tc-slip-missed", "msg-unknown"]);
    expect([...patched]).toEqual([["msg-tc-slip-new", "v1"]]);
    expect(await loadPatchedVersions(db, [])).toEqual(new Map());
  });

  it("drops a slip's patch when its test case is deleted", async () => {
    await recordFilterRelease(db, report, now);
    await d1.prepare("DELETE FROM test_cases WHERE id = 'tc-slip-new'").bind().run();
    expect((await patches()).map((p) => p.test_case_id)).toEqual(["tc-slip-old"]);
  });
});
