import { afterEach, describe, expect, it, vi } from "vitest";

import { CATEGORIES, type CategoryId } from "@/lib/moderation/categories";
import { filterVersion, type FilterConfig } from "@/lib/moderation/filter-versions";
import { OFF_LIMITS_ID } from "@/lib/moderation/off-limits";
import { TypeSafeError } from "@/lib/moderation/typesafe";
import { SEED_FIXTURES } from "@/lib/seeds";
import {
  defaultReportPath,
  parseEvaluateFilterArgs,
  setupError,
} from "../../../scripts/evaluate-filter";
import { seedTestCases, type FilterTestCase } from "./cases";
import {
  evaluateFilterRelease,
  releaseGate,
  serializeFilterReleaseReport,
  type FilterScoreFn,
} from "./evaluate";

const IDS = CATEGORIES.map((c) => c.id);
const v1 = filterVersion("v1");

/** v1 with a stricter profanity threshold: same questions, so scores can be shared. */
const stricterProfanity: FilterConfig = {
  ...v1,
  id: "candidate",
  thresholds: { ...v1.thresholds, rules: { ...v1.thresholds.rules, profanity: 0.3 } },
};

function scores(overrides: Partial<Record<CategoryId, number>> = {}, offLimitsScore = 0.02) {
  return {
    model: "jev-test",
    scores: { ...(Object.fromEntries(IDS.map((id) => [id, 0.02])) as Record<CategoryId, number>), ...overrides },
    offLimitsScore,
  };
}

function testCase(
  id: string,
  expectedVerdict: FilterTestCase["expectedVerdict"],
  rule: CategoryId | null = null,
  source: FilterTestCase["source"] = "game",
): FilterTestCase {
  return { id, source, text: `secret text ${id}`, context: [], roomUsernames: [], expectedVerdict, rule };
}

/** Scores keyed by case id; a missing entry is a Jev failure. */
function scoreTable(table: Record<string, ReturnType<typeof scores>>): FilterScoreFn {
  return async (c) => {
    const entry = table[c.id];
    if (!entry) throw new TypeSafeError('TypeSafe responded 500: {"detail":"leak"}', 500);
    return entry;
  };
}

const CASES = [
  testCase("slip-mild-swear", "not_ok", "profanity"),
  testCase("slip-obvious", "not_ok", "profanity"),
  testCase("fine-chat", "fine", null, "seed"),
  testCase("fine-near-line", "fine"),
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("evaluateFilterRelease", () => {
  it("passes the gate when catches rise and false positives hold", async () => {
    const report = await evaluateFilterRelease(CASES, v1, stricterProfanity, scoreTable({
      "slip-mild-swear": scores({ profanity: 0.35 }),
      "slip-obvious": scores({ profanity: 0.9 }),
      "fine-chat": scores(),
      "fine-near-line": scores({ profanity: 0.2 }),
    }));
    expect(report.baseline).toMatchObject({ id: "v1", catches: 1, falsePositives: 0 });
    expect(report.candidate).toMatchObject({ id: "candidate", catches: 2, falsePositives: 0 });
    expect(report.gate).toEqual({ passed: true, reasons: [] });
    expect(report.changes.newlyCaught).toEqual(["slip-mild-swear"]);
    expect(report.candidate.byRule.profanity).toEqual({
      expectedViolations: 2, catches: 2, misses: 0, falsePositiveFlags: 0,
    });
    expect(report.baseline.byRule.profanity.misses).toBe(1);
    expect(report.testSet).toMatchObject({ seedCases: 1, gameCases: 3 });
    expect(report.model.resolved).toBe("jev-test");
  });

  it("fails the gate when false positives rise, and lists what is still wrong", async () => {
    const report = await evaluateFilterRelease(CASES, v1, stricterProfanity, scoreTable({
      "slip-mild-swear": scores({ profanity: 0.35 }),
      "slip-obvious": scores({ spam: 0.9 }),
      "fine-chat": scores(),
      "fine-near-line": scores({ profanity: 0.4 }),
    }));
    expect(report.candidate.catches).toBeGreaterThan(report.baseline.catches);
    expect(report.gate.passed).toBe(false);
    expect(report.gate.reasons).toEqual(["False positives must not rise: 0 -> 1."]);
    expect(report.remaining.missedSlips).toEqual([
      { id: "slip-obvious", source: "game", expectedRule: "profanity", kind: "wrong_rule", flaggedRules: ["spam"] },
    ]);
    expect(report.remaining.wronglyBlocked.map((c) => c.id)).toEqual(["fine-near-line"]);
    expect(report.changes.newlyWronglyBlocked).toEqual(["fine-near-line"]);
    expect(report.candidate.byRule.profanity.falsePositiveFlags).toBe(1);
  });

  it("fails the gate when catches do not rise", async () => {
    const report = await evaluateFilterRelease(CASES, v1, v1, scoreTable({
      "slip-mild-swear": scores({ profanity: 0.9 }),
      "slip-obvious": scores({ profanity: 0.9 }),
      "fine-chat": scores(),
      "fine-near-line": scores(),
    }));
    expect(report.gate).toEqual({ passed: false, reasons: ["Catches must rise: 2 -> 2."] });
  });

  it("counts an off-limits exclusion of a fine case as a false positive", async () => {
    const report = await evaluateFilterRelease([testCase("fine-chat", "fine")], v1, stricterProfanity, scoreTable({
      "fine-chat": scores({}, 0.9),
    }));
    expect(report.candidate.falsePositives).toBe(1);
    expect(report.remaining.wronglyBlocked[0]?.kind).toBe("off_limits_unexpected");
  });

  it("counts any block as catching a slip captured without a rule", async () => {
    const report = await evaluateFilterRelease([testCase("slip-no-rule", "not_ok")], v1, stricterProfanity, scoreTable({
      "slip-no-rule": scores({ spam: 0.9 }),
    }));
    expect(report.cases[0].candidate.kind).toBe("catch");
  });

  it("never records an error as passed and fails the gate on any error", async () => {
    const report = await evaluateFilterRelease(CASES, v1, stricterProfanity, scoreTable({
      "slip-mild-swear": scores({ profanity: 0.35 }),
      "slip-obvious": scores({ profanity: 0.9 }),
      "fine-chat": scores(),
    }));
    const failed = report.cases.find((c) => c.id === "fine-near-line")!;
    expect(failed.baseline).toEqual({ kind: "error", outcome: null, flaggedRules: [], error: "jev_server_error" });
    expect(failed.candidate).toEqual(failed.baseline);
    for (const c of report.cases) {
      for (const run of [c.baseline, c.candidate]) {
        if (run.kind === "error") expect(run.outcome).toBeNull();
        if (run.outcome === "passed") expect(run.kind).not.toBe("error");
      }
    }
    expect(report.candidate.summary).toMatchObject({ pass: 1, errors: 1 });
    expect(report.remaining.errors.map((c) => c.id)).toEqual(["fine-near-line"]);
    expect(report.gate.passed).toBe(false);
    expect(report.gate.reasons[0]).toBe("Every case must be judged: 1 baseline and 1 candidate errors.");
    expect(serializeFilterReleaseReport(report)).not.toContain("leak");
  });

  it("calls Jev once per case when versions differ only in thresholds, twice otherwise", async () => {
    const score = vi.fn<FilterScoreFn>(async () => scores());
    await evaluateFilterRelease(CASES, v1, stricterProfanity, score);
    expect(score).toHaveBeenCalledTimes(CASES.length);

    score.mockClear();
    const reworded: FilterConfig = { ...v1, id: "reworded", normalization: ["lowercase"] };
    await evaluateFilterRelease(CASES, v1, reworded, score);
    expect(score).toHaveBeenCalledTimes(CASES.length * 2);
    expect(score.mock.calls.map(([, filter]) => filter.id)).toContain("reworded");
  });

  it("writes a reproducible report with case ids but no message text", async () => {
    const table = scoreTable(Object.fromEntries(CASES.map((c) => [c.id, scores()])));
    const first = await evaluateFilterRelease(CASES, v1, stricterProfanity, table);
    const second = await evaluateFilterRelease([...CASES].reverse(), v1, stricterProfanity, table);
    const json = serializeFilterReleaseReport(first);
    expect(json).toContain("slip-mild-swear");
    expect(json).not.toContain("secret text");
    expect(first.testSet.fingerprint).toBe(second.testSet.fingerprint);
    expect(first.cases).toEqual(second.cases);
    expect(first.baseline.fingerprint).not.toBe(first.candidate.fingerprint);
  });

  it("runs every seed fixture through moderation with mocked Jev", async () => {
    const fetchMock = vi.fn(async () => {
      const answers = Object.fromEntries([...IDS, OFF_LIMITS_ID].map((id) => [id, { type: "noul", noul: 0.02 }]));
      return new Response(JSON.stringify({ model: "jev-test", answers }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
    const report = await evaluateFilterRelease(seedTestCases(SEED_FIXTURES), v1, stricterProfanity);
    expect(fetchMock).toHaveBeenCalledTimes(SEED_FIXTURES.length);
    expect(report.cases).toHaveLength(SEED_FIXTURES.length);
    expect(report.candidate.summary.errors).toBe(0);
  });
});

describe("releaseGate", () => {
  it("requires strictly more catches and no more false positives", async () => {
    const report = await evaluateFilterRelease([], v1, stricterProfanity, scoreTable({}));
    const run = (catches: number, falsePositives: number) => ({ ...report.baseline, catches, falsePositives });
    expect(releaseGate(run(3, 2), run(4, 2)).passed).toBe(true);
    expect(releaseGate(run(3, 2), run(5, 1)).passed).toBe(true);
    expect(releaseGate(run(3, 2), run(3, 1)).passed).toBe(false);
    expect(releaseGate(run(3, 2), run(9, 3)).passed).toBe(false);
  });
});

describe("evaluate:filter CLI", () => {
  it("parses flags and defaults the baseline to the active version", () => {
    const options = parseEvaluateFilterArgs([
      "node", "script.ts", "--live", "--candidate", "v2", "--game-cases", "cases.json",
    ]);
    expect(options).toEqual({
      live: true, baseline: "v1", candidate: "v2", gameCases: "cases.json", seedsOnly: false, output: null,
    });
    expect(defaultReportPath("v1", "v2")).toMatch(/^reports[\\/]filter-release-v1-to-v2\.json$/);
    expect(() => parseEvaluateFilterArgs(["node", "script.ts", "--candidate"])).toThrow(/Missing value/);
  });

  it("refuses to bill Jev without --live, a candidate and an explicit case set", () => {
    const env = { TYPESAFE_API_KEY: "key" };
    const parse = (...args: string[]) => parseEvaluateFilterArgs(["node", "script.ts", ...args]);
    expect(setupError(parse("--candidate", "v2", "--seeds-only"), env)).toMatch(/--live/);
    expect(setupError(parse("--live", "--seeds-only"), env)).toMatch(/--candidate/);
    expect(setupError(parse("--live", "--candidate", "v2"), env)).toMatch(/--game-cases/);
    expect(setupError(parse("--live", "--candidate", "v2", "--seeds-only"), {})).toMatch(/TYPESAFE_API_KEY/);
    expect(setupError(parse("--live", "--candidate", "v2", "--seeds-only"), { ...env, MODERATION_THRESHOLD: "0.4" }))
      .toMatch(/Unset MODERATION_THRESHOLD/);
    expect(setupError(parse("--live", "--candidate", "v2", "--seeds-only"), env)).toBeNull();
  });
});
