/**
 * Filter release gate. Runs the permanent test set through a baseline and a
 * candidate filter version (see docs/FILTER_RELEASES.md). Billed: requires --live.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { gameTestCasesFromExport, seedTestCases, type FilterTestCase } from "../src/lib/filter-release/cases";
import { evaluateFilterRelease, serializeFilterReleaseReport } from "../src/lib/filter-release/evaluate";
import { ACTIVE_FILTER_VERSION_ID, filterVersion } from "../src/lib/moderation/filter-versions";
import { SEED_FIXTURES } from "../src/lib/seeds/index";

export interface EvaluateFilterCliOptions {
  live: boolean;
  baseline: string;
  candidate: string | null;
  gameCases: string | null;
  seedsOnly: boolean;
  output: string | null;
}

export function defaultReportPath(baseline: string, candidate: string): string {
  return path.join("reports", `filter-release-${baseline}-to-${candidate}.json`);
}

export function parseEvaluateFilterArgs(argv: string[]): EvaluateFilterCliOptions {
  const options: EvaluateFilterCliOptions = {
    live: false,
    baseline: ACTIVE_FILTER_VERSION_ID,
    candidate: null,
    gameCases: null,
    seedsOnly: false,
    output: null,
  };
  const value = (i: number, flag: string) => {
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    return next;
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--live") options.live = true;
    else if (arg === "--seeds-only") options.seedsOnly = true;
    else if (arg === "--baseline") options.baseline = value(i++, arg);
    else if (arg === "--candidate") options.candidate = value(i++, arg);
    else if (arg === "--game-cases") options.gameCases = value(i++, arg);
    else if (arg === "--output" || arg === "-o") options.output = value(i++, arg);
    else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printUsage(): void {
  console.log(`Usage: npm run evaluate:filter -- --live --candidate <id> --game-cases <export.json> [--baseline <id>] [--output path]
       npm run evaluate:filter -- --live --candidate <id> --seeds-only [...]

Runs every seed fixture and game test case through the baseline (default: the
active version, ${ACTIVE_FILTER_VERSION_ID}) and the candidate. Bills one Jev request per case
per version, or one per case when the versions differ only in thresholds.

Exit codes: 0 gate passed, 1 usage or setup error, 2 Jev errors, 3 gate failed.
Default output: ${defaultReportPath("<baseline>", "<candidate>")}
`);
}

async function loadCases(options: EvaluateFilterCliOptions): Promise<FilterTestCase[]> {
  const seeds = seedTestCases(SEED_FIXTURES);
  if (!options.gameCases) return seeds;
  const exported: unknown = JSON.parse(await readFile(options.gameCases, "utf8"));
  return [...seeds, ...gameTestCasesFromExport(exported)];
}

/** Returns the reason the run cannot start, or null. */
export function setupError(options: EvaluateFilterCliOptions, env: Record<string, string | undefined>): string | null {
  if (!options.live) {
    return "Refusing to run without --live. This command bills Jev for every test case. Pass --live only when you intend to spend API quota.";
  }
  if (!options.candidate) return "Pass --candidate <filter version id>.";
  if (!options.gameCases && !options.seedsOnly) {
    return "Pass --game-cases <wrangler export> to include game cases, or --seeds-only to gate on seeds alone.";
  }
  if (options.gameCases && options.seedsOnly) return "--game-cases and --seeds-only cannot be combined.";
  if (env.MODERATION_THRESHOLD?.trim() || env.MODERATION_THRESHOLD_OFF_LIMITS?.trim()) {
    return "Unset MODERATION_THRESHOLD and MODERATION_THRESHOLD_OFF_LIMITS. The gate compares versions as written; put threshold changes in a filter version.";
  }
  if (!env.TYPESAFE_API_KEY?.trim()) {
    return "TYPESAFE_API_KEY is not set. Add it to the environment before running the release gate.";
  }
  return null;
}

async function main(): Promise<void> {
  const options = parseEvaluateFilterArgs(process.argv);
  const problem = setupError(options, process.env);
  if (problem) {
    console.error(problem);
    printUsage();
    process.exit(1);
  }
  const baseline = filterVersion(options.baseline);
  const candidate = filterVersion(options.candidate!);
  const cases = await loadCases(options);
  const output = options.output ?? defaultReportPath(baseline.id, candidate.id);

  console.log(`Evaluating ${cases.length} test cases: ${baseline.id} (baseline) vs ${candidate.id} (candidate). Output: ${output}`);
  const report = await evaluateFilterRelease(cases, baseline, candidate);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, serializeFilterReleaseReport(report), "utf8");

  const { baseline: before, candidate: after, gate, remaining } = report;
  console.log(`Catches ${before.catches} -> ${after.catches}. False positives ${before.falsePositives} -> ${after.falsePositives}.`);
  console.log(`Remaining: ${remaining.missedSlips.length} missed slips, ${remaining.wronglyBlocked.length} wrongly blocked fine cases.`);
  console.log(gate.passed ? `Gate passed: ${candidate.id} may ship.` : `Gate failed:\n- ${gate.reasons.join("\n- ")}`);

  if (before.summary.errors > 0 || after.summary.errors > 0) process.exit(2);
  if (!gate.passed) process.exit(3);
}

const isCliEntry =
  typeof process.argv[1] === "string" && process.argv[1].includes("evaluate-filter");

if (isCliEntry) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
