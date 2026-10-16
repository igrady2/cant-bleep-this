import "server-only";

import { CATEGORIES, POLICY_VERSION, type CategoryId } from "@/lib/moderation/categories";
import { moderate } from "@/lib/moderation";
import { offLimitsThreshold, reviewableThreshold } from "@/lib/moderation/thresholds";
import { TypeSafeError } from "@/lib/moderation/typesafe";
import type { FilterOutcome, ModerationResult } from "@/lib/moderation/types";
import seedMeta from "../../../fixtures/seeds.json";
import type { SeedFixture } from "@/lib/seeds/types";

const SEED_POLICY_VERSION = (seedMeta as { policyVersion: string }).policyVersion;

const DEFAULT_MODEL = "jev-latest";

export type SeedEvalOutcomeKind =
  | "pass"
  | "catch"
  | "miss"
  | "false_positive"
  | "wrong_rule"
  | "off_limits_unexpected"
  | "error";

interface SeedEvalCaseBase {
  id: string;
  contextual: boolean;
  expectedVerdict: SeedFixture["expectedVerdict"];
  expectedRule: CategoryId | null;
}

/**
 * A failed moderation call has no filter outcome, so an error row can never
 * read as passed.
 */
export type SeedEvalCaseResult = SeedEvalCaseBase & (
  | { outcome: FilterOutcome; flaggedRules: CategoryId[]; kind: Exclude<SeedEvalOutcomeKind, "error"> }
  | { outcome: null; flaggedRules: []; kind: "error"; error: string }
);

export interface SeedEvalRuleStats {
  /** Fixtures labeled not_ok for this rule. */
  expectedViolations: number;
  /** Blocked and the expected rule appears among flagged rules. */
  catches: number;
  /** Expected this rule but the filter passed. */
  misses: number;
  /** Expected fine but this rule was among flags (may count multiple rules per fixture). */
  falsePositiveFlags: number;
}

export interface SeedEvalFailureRef {
  id: string;
  kind: SeedEvalOutcomeKind;
  contextual: boolean;
  expectedRule: CategoryId | null;
  /** Null for `kind: "error"`. */
  outcome: FilterOutcome | null;
  flaggedRules: CategoryId[];
}

export interface SeedEvalReport {
  reportVersion: 1;
  generatedAt: string;
  policyVersion: string;
  filterPolicyVersion: string;
  fixtureCount: number;
  configuration: {
    reviewableThreshold: number;
    offLimitsThreshold: number;
    typesafeModelRequested: string;
    typesafeModelResolved: string | null;
  };
  summary: {
    pass: number;
    catch: number;
    miss: number;
    falsePositive: number;
    wrongRule: number;
    offLimitsUnexpected: number;
    contextualFailures: number;
    errors: number;
  };
  byRule: Record<CategoryId, SeedEvalRuleStats>;
  failures: SeedEvalFailureRef[];
  cases: SeedEvalCaseResult[];
}

export type SeedModerateFn = (fixture: SeedFixture) => Promise<ModerationResult>;

/** Redacted marker for baseline reports — never raw provider or stack text. */
export function sanitizeSeedEvalError(err: unknown): string {
  if (err instanceof TypeSafeError) {
    const status = err.status;
    if (status === 401 || status === 403) return "jev_auth_error";
    if (status === 429) return "jev_rate_limited";
    if (status === 529) return "jev_overloaded";
    if (status !== undefined && status >= 500) return "jev_server_error";
    if (status !== undefined && status >= 400) return "jev_client_error";
    return "jev_error";
  }
  if (err instanceof Error) {
    if (err.name === "AbortError" || err.name === "TimeoutError") return "jev_timeout";
  }
  return "moderation_error";
}

function emptyByRule(): Record<CategoryId, SeedEvalRuleStats> {
  return Object.fromEntries(
    CATEGORIES.map((c) => [
      c.id,
      { expectedViolations: 0, catches: 0, misses: 0, falsePositiveFlags: 0 },
    ]),
  ) as Record<CategoryId, SeedEvalRuleStats>;
}

function flaggedRuleIds(result: ModerationResult): CategoryId[] {
  return result.flags.map((f) => f.category);
}

export function classifySeedEvalCase(
  fixture: Pick<SeedFixture, "expectedVerdict" | "rule">,
  result: ModerationResult,
): Exclude<SeedEvalOutcomeKind, "error"> {
  const flagged = flaggedRuleIds(result);

  if (fixture.expectedVerdict === "fine") {
    if (result.outcome === "passed") return "pass";
    if (result.outcome === "off_limits") return "off_limits_unexpected";
    return "false_positive";
  }

  const expectedRule = fixture.rule;
  if (result.outcome === "off_limits") return "off_limits_unexpected";
  if (result.outcome === "passed") return "miss";
  if (expectedRule && flagged.includes(expectedRule)) return "catch";
  return "wrong_rule";
}

function isContextualFailure(kind: SeedEvalOutcomeKind, contextual: boolean): boolean {
  if (!contextual) return false;
  return kind === "miss" || kind === "false_positive" || kind === "wrong_rule";
}

function applyCaseToByRule(
  byRule: Record<CategoryId, SeedEvalRuleStats>,
  fixture: SeedFixture,
  kind: SeedEvalOutcomeKind,
  flagged: CategoryId[],
): void {
  if (fixture.expectedVerdict === "not_ok" && fixture.rule) {
    byRule[fixture.rule].expectedViolations += 1;
    if (kind === "catch") byRule[fixture.rule].catches += 1;
    if (kind === "miss") byRule[fixture.rule].misses += 1;
  }
  if (kind === "false_positive" || kind === "off_limits_unexpected") {
    for (const rule of flagged) {
      byRule[rule].falsePositiveFlags += 1;
    }
  }
}

export async function evaluateSeedFixtures(
  fixtures: readonly SeedFixture[],
  moderateFn: SeedModerateFn = defaultModerate,
): Promise<SeedEvalReport> {
  const byRule = emptyByRule();
  const cases: SeedEvalCaseResult[] = [];
  const failures: SeedEvalFailureRef[] = [];
  let typesafeModelResolved: string | null = null;

  const summary = {
    pass: 0,
    catch: 0,
    miss: 0,
    falsePositive: 0,
    wrongRule: 0,
    offLimitsUnexpected: 0,
    contextualFailures: 0,
    errors: 0,
  };

  for (const fixture of fixtures) {
    const contextual = fixture.context.length > 0;
    try {
      const result = await moderateFn(fixture);
      if (!typesafeModelResolved && result.model) {
        typesafeModelResolved = result.model;
      }
      const kind = classifySeedEvalCase(fixture, result);
      const flagged = flaggedRuleIds(result);
      const caseResult: SeedEvalCaseResult = {
        id: fixture.id,
        contextual,
        expectedVerdict: fixture.expectedVerdict,
        expectedRule: fixture.rule,
        outcome: result.outcome,
        flaggedRules: flagged,
        kind,
      };
      cases.push(caseResult);
      applyCaseToByRule(byRule, fixture, kind, flagged);

      if (kind === "pass") summary.pass += 1;
      else if (kind === "catch") summary.catch += 1;
      else if (kind === "miss") summary.miss += 1;
      else if (kind === "false_positive") summary.falsePositive += 1;
      else if (kind === "wrong_rule") summary.wrongRule += 1;
      else if (kind === "off_limits_unexpected") summary.offLimitsUnexpected += 1;

      if (isContextualFailure(kind, contextual)) {
        summary.contextualFailures += 1;
        failures.push({
          id: fixture.id,
          kind,
          contextual,
          expectedRule: fixture.rule,
          outcome: result.outcome,
          flaggedRules: flagged,
        });
      } else if (kind !== "pass" && kind !== "catch") {
        failures.push({
          id: fixture.id,
          kind,
          contextual,
          expectedRule: fixture.rule,
          outcome: result.outcome,
          flaggedRules: flagged,
        });
      }
    } catch (err) {
      summary.errors += 1;
      cases.push({
        id: fixture.id,
        contextual,
        expectedVerdict: fixture.expectedVerdict,
        expectedRule: fixture.rule,
        outcome: null,
        flaggedRules: [],
        kind: "error",
        error: sanitizeSeedEvalError(err),
      });
      failures.push({
        id: fixture.id,
        kind: "error",
        contextual,
        expectedRule: fixture.rule,
        outcome: null,
        flaggedRules: [],
      });
    }
  }

  return {
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    policyVersion: SEED_POLICY_VERSION,
    filterPolicyVersion: POLICY_VERSION,
    fixtureCount: fixtures.length,
    configuration: {
      reviewableThreshold: reviewableThreshold(),
      offLimitsThreshold: offLimitsThreshold(),
      typesafeModelRequested: process.env.TYPESAFE_MODEL?.trim() || DEFAULT_MODEL,
      typesafeModelResolved,
    },
    summary,
    byRule,
    failures,
    cases,
  };
}

async function defaultModerate(fixture: SeedFixture): Promise<ModerationResult> {
  return moderate(fixture.text, {
    context: fixture.context,
    roomUsernames: fixture.roomUsernames,
  });
}

/** Stable JSON for baseline reports (sorted keys, no fixture message text). */
export function serializeSeedEvalReport(report: SeedEvalReport): string {
  const sortedCases = [...report.cases].sort((a, b) => a.id.localeCompare(b.id));
  const sortedFailures = [...report.failures].sort((a, b) => a.id.localeCompare(b.id));
  const payload = {
    ...report,
    cases: sortedCases,
    failures: sortedFailures,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}
