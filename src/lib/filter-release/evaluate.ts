import "server-only";

import { CATEGORIES, type CategoryId } from "@/lib/moderation/categories";
import { DEFAULT_MODEL, decideModeration, scoreMessage, type JevScores } from "@/lib/moderation";
import {
  contentHash,
  filterFingerprint,
  scoringFingerprint,
  type FilterConfig,
} from "@/lib/moderation/filter-versions";
import type { FilterOutcome } from "@/lib/moderation/types";
import {
  classifySeedEvalCase,
  sanitizeSeedEvalError,
  type SeedEvalOutcomeKind,
} from "@/lib/seeds/evaluate";
import type { FilterTestCase } from "./cases";

export type FilterCaseKind = SeedEvalOutcomeKind;

/**
 * One version's result on one case. A failed Jev call has no outcome, so an
 * error can never count as passed or caught.
 */
export type FilterCaseRun =
  | { kind: Exclude<FilterCaseKind, "error">; outcome: FilterOutcome; flaggedRules: CategoryId[] }
  | { kind: "error"; outcome: null; flaggedRules: []; error: string };

export interface FilterReleaseCase {
  id: string;
  source: FilterTestCase["source"];
  expectedVerdict: FilterTestCase["expectedVerdict"];
  expectedRule: CategoryId | null;
  baseline: FilterCaseRun;
  candidate: FilterCaseRun;
}

export interface FilterRuleStats {
  /** Cases labeled not_ok for this rule. */
  expectedViolations: number;
  catches: number;
  misses: number;
  /** Wrongly blocked fine cases with this rule among the flags. */
  falsePositiveFlags: number;
}

export interface FilterVersionRun {
  id: string;
  /** Hash of the whole configuration, so a report pins the exact wording and thresholds. */
  fingerprint: string;
  thresholds: FilterConfig["thresholds"];
  normalization: FilterConfig["normalization"];
  summary: Record<"pass" | "catch" | "miss" | "falsePositive" | "wrongRule" | "offLimitsUnexpected" | "errors", number>;
  /** not_ok cases blocked with the labeled rule among the flags. */
  catches: number;
  /** fine cases blocked or excluded. */
  falsePositives: number;
  byRule: Record<CategoryId, FilterRuleStats>;
}

export interface FilterCaseRef {
  id: string;
  source: FilterTestCase["source"];
  expectedRule: CategoryId | null;
  kind: FilterCaseKind;
  flaggedRules: CategoryId[];
}

export interface FilterReleaseReport {
  reportVersion: 1;
  generatedAt: string;
  model: { requested: string; resolved: string | null };
  testSet: {
    seedCases: number;
    gameCases: number;
    /** Hash of every case's text, context and label; equal hashes mean the same inputs. */
    fingerprint: string;
  };
  baseline: FilterVersionRun;
  candidate: FilterVersionRun;
  gate: {
    passed: boolean;
    /** Why the gate failed; empty when it passed. */
    reasons: string[];
  };
  /** Candidate results the next version should fix. */
  remaining: {
    /** not_ok cases the candidate does not catch. */
    missedSlips: FilterCaseRef[];
    /** fine cases the candidate blocks or excludes. */
    wronglyBlocked: FilterCaseRef[];
    errors: FilterCaseRef[];
  };
  /** Case ids whose result moved between baseline and candidate. */
  changes: {
    newlyCaught: string[];
    noLongerCaught: string[];
    newlyWronglyBlocked: string[];
    noLongerWronglyBlocked: string[];
  };
  cases: FilterReleaseCase[];
}

export type FilterScoreFn = (testCase: FilterTestCase, filter: FilterConfig) => Promise<JevScores>;

function defaultScore(testCase: FilterTestCase, filter: FilterConfig): Promise<JevScores> {
  return scoreMessage(testCase.text, {
    context: testCase.context,
    roomUsernames: testCase.roomUsernames,
    filter,
  });
}

export function classifyFilterCase(
  testCase: Pick<FilterTestCase, "expectedVerdict" | "rule">,
  scored: JevScores,
  filter: FilterConfig,
): FilterCaseRun {
  const result = decideModeration(scored, filter.thresholds);
  const flaggedRules = result.flags.map((flag) => flag.category);
  // A slip captured without a deciding rule is caught by any block.
  const kind = testCase.expectedVerdict === "not_ok" && testCase.rule === null && result.outcome === "blocked"
    ? "catch"
    : classifySeedEvalCase(testCase, result);
  return { kind, outcome: result.outcome, flaggedRules };
}

function isCatch(run: FilterCaseRun): boolean {
  return run.kind === "catch";
}

function isWronglyBlocked(testCase: { expectedVerdict: string }, run: FilterCaseRun): boolean {
  return testCase.expectedVerdict === "fine"
    && (run.kind === "false_positive" || run.kind === "off_limits_unexpected");
}

async function summarize(
  filter: FilterConfig,
  cases: readonly FilterReleaseCase[],
  side: "baseline" | "candidate",
): Promise<FilterVersionRun> {
  const summary = { pass: 0, catch: 0, miss: 0, falsePositive: 0, wrongRule: 0, offLimitsUnexpected: 0, errors: 0 };
  const byRule = Object.fromEntries(
    CATEGORIES.map((c) => [c.id, { expectedViolations: 0, catches: 0, misses: 0, falsePositiveFlags: 0 }]),
  ) as Record<CategoryId, FilterRuleStats>;
  let falsePositives = 0;

  for (const testCase of cases) {
    const run = testCase[side];
    if (run.kind === "error") summary.errors += 1;
    else if (run.kind === "pass") summary.pass += 1;
    else if (run.kind === "catch") summary.catch += 1;
    else if (run.kind === "miss") summary.miss += 1;
    else if (run.kind === "false_positive") summary.falsePositive += 1;
    else if (run.kind === "wrong_rule") summary.wrongRule += 1;
    else summary.offLimitsUnexpected += 1;

    if (testCase.expectedRule) {
      byRule[testCase.expectedRule].expectedViolations += 1;
      if (run.kind === "catch") byRule[testCase.expectedRule].catches += 1;
      if (run.kind === "miss") byRule[testCase.expectedRule].misses += 1;
    }
    if (isWronglyBlocked(testCase, run)) {
      falsePositives += 1;
      for (const rule of run.flaggedRules) byRule[rule].falsePositiveFlags += 1;
    }
  }

  return {
    id: filter.id,
    fingerprint: await filterFingerprint(filter),
    thresholds: filter.thresholds,
    normalization: filter.normalization,
    summary,
    catches: summary.catch,
    falsePositives,
    byRule,
  };
}

/** Ships only if catches go up and false positives don't, with every case judged by both versions. */
export function releaseGate(
  baseline: FilterVersionRun,
  candidate: FilterVersionRun,
): FilterReleaseReport["gate"] {
  const reasons: string[] = [];
  if (baseline.summary.errors > 0 || candidate.summary.errors > 0) {
    reasons.push(
      `Every case must be judged: ${baseline.summary.errors} baseline and ${candidate.summary.errors} candidate errors.`,
    );
  }
  if (candidate.catches <= baseline.catches) {
    reasons.push(`Catches must rise: ${baseline.catches} -> ${candidate.catches}.`);
  }
  if (candidate.falsePositives > baseline.falsePositives) {
    reasons.push(`False positives must not rise: ${baseline.falsePositives} -> ${candidate.falsePositives}.`);
  }
  return { passed: reasons.length === 0, reasons };
}

function caseRef(testCase: FilterReleaseCase): FilterCaseRef {
  return {
    id: testCase.id,
    source: testCase.source,
    expectedRule: testCase.expectedRule,
    kind: testCase.candidate.kind,
    flaggedRules: testCase.candidate.flaggedRules,
  };
}

/**
 * Runs every case through the baseline and the candidate. One Jev call per
 * case serves both when they share questions and normalization.
 */
export async function evaluateFilterRelease(
  testCases: readonly FilterTestCase[],
  baseline: FilterConfig,
  candidate: FilterConfig,
  score: FilterScoreFn = defaultScore,
): Promise<FilterReleaseReport> {
  const sharedScores = (await scoringFingerprint(baseline)) === (await scoringFingerprint(candidate));
  let resolvedModel: string | null = null;

  async function run(testCase: FilterTestCase, filter: FilterConfig): Promise<JevScores | { error: string }> {
    try {
      const scored = await score(testCase, filter);
      resolvedModel ??= scored.model;
      return scored;
    } catch (err) {
      return { error: sanitizeSeedEvalError(err) };
    }
  }

  function judge(testCase: FilterTestCase, scored: JevScores | { error: string }, filter: FilterConfig): FilterCaseRun {
    if ("error" in scored) return { kind: "error", outcome: null, flaggedRules: [], error: scored.error };
    return classifyFilterCase(testCase, scored, filter);
  }

  const cases: FilterReleaseCase[] = [];
  for (const testCase of testCases) {
    const baselineScores = await run(testCase, baseline);
    const candidateScores = sharedScores ? baselineScores : await run(testCase, candidate);
    cases.push({
      id: testCase.id,
      source: testCase.source,
      expectedVerdict: testCase.expectedVerdict,
      expectedRule: testCase.expectedVerdict === "not_ok" ? testCase.rule : null,
      baseline: judge(testCase, baselineScores, baseline),
      candidate: judge(testCase, candidateScores, candidate),
    });
  }
  cases.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const baselineRun = await summarize(baseline, cases, "baseline");
  const candidateRun = await summarize(candidate, cases, "candidate");
  const ids = (predicate: (testCase: FilterReleaseCase) => boolean) =>
    cases.filter(predicate).map((testCase) => testCase.id);

  return {
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    model: { requested: process.env.TYPESAFE_MODEL?.trim() || DEFAULT_MODEL, resolved: resolvedModel },
    testSet: {
      seedCases: testCases.filter((testCase) => testCase.source === "seed").length,
      gameCases: testCases.filter((testCase) => testCase.source === "game").length,
      fingerprint: await contentHash(
        [...testCases].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      ),
    },
    baseline: baselineRun,
    candidate: candidateRun,
    gate: releaseGate(baselineRun, candidateRun),
    remaining: {
      missedSlips: cases
        .filter((c) => c.expectedVerdict === "not_ok" && c.candidate.kind !== "catch" && c.candidate.kind !== "error")
        .map(caseRef),
      wronglyBlocked: cases.filter((c) => isWronglyBlocked(c, c.candidate)).map(caseRef),
      errors: cases.filter((c) => c.candidate.kind === "error").map(caseRef),
    },
    changes: {
      newlyCaught: ids((c) => !isCatch(c.baseline) && isCatch(c.candidate)),
      noLongerCaught: ids((c) => isCatch(c.baseline) && !isCatch(c.candidate)),
      newlyWronglyBlocked: ids((c) => !isWronglyBlocked(c, c.baseline) && isWronglyBlocked(c, c.candidate)),
      noLongerWronglyBlocked: ids((c) => isWronglyBlocked(c, c.baseline) && !isWronglyBlocked(c, c.candidate)),
    },
    cases,
  };
}

/** Report JSON holds case ids, labels and outcomes only, never message text. */
export function serializeFilterReleaseReport(report: FilterReleaseReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
