import "server-only";

import { databaseRows, type MessagesDatabase } from "@/lib/messages/db";
import {
  ACTIVE_FILTER_VERSION_ID,
  filterFingerprint,
  findFilterVersion,
} from "@/lib/moderation/filter-versions";
import { releaseGate, type FilterCaseKind, type FilterVersionRun } from "./evaluate";

/** PRD success measure: confirmed slip to fix shipped in 2 weeks or less. */
export const PATCH_TIME_TARGET_SECONDS = 14 * 24 * 60 * 60;

/** D1 caps bound parameters per statement. */
const ID_CHUNK = 90;

const CASE_KINDS: readonly FilterCaseKind[] = [
  "pass", "catch", "miss", "false_positive", "wrong_rule", "off_limits_unexpected", "error",
];

/** The parts of a #25 report that recording a release relies on, after validation. */
export interface ReleaseReportInput {
  generatedAt: number;
  testSetFingerprint: string;
  baselineId: string;
  candidateId: string;
  candidateFingerprint: string;
  cases: {
    id: string;
    source: "seed" | "game";
    expectedVerdict: "fine" | "not_ok";
    baseline: FilterCaseKind;
    candidate: FilterCaseKind;
  }[];
}

export interface FilterRelease {
  version: string;
  releasedAt: number;
  baselineVersion: string;
  catches: number;
  baselineCatches: number;
  falsePositives: number;
  baselineFalsePositives: number;
  patchedSlips: number;
  /** Patch time (confirmed slip to release) over slips with a known confirmation time. */
  patchTime: { measured: number; medianSeconds: number | null; withinTarget: number };
}

/** Public board view of a release: no fingerprints or gate counts. */
export interface PublicFilterRelease {
  version: string;
  releasedAt: number;
  patchedSlips: number;
}

export type RecordReleaseResult =
  | { ok: true; release: FilterRelease }
  | { ok: false; status: 400 | 409 | 422; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isText = (value: unknown): value is string => typeof value === "string" && value !== "" && value.length <= 200;
const isKind = (value: unknown): value is FilterCaseKind =>
  typeof value === "string" && (CASE_KINDS as readonly string[]).includes(value);

/** Validates an untrusted report body. Returns the error to show, or the parsed input. */
export function parseReleaseReport(json: unknown): ReleaseReportInput | string {
  if (!isRecord(json) || json.reportVersion !== 1) return "Upload a filter release report (reportVersion 1).";
  const { baseline, candidate, testSet, gate, cases } = json;
  if (!isRecord(baseline) || !isText(baseline.id)) return "The report has no baseline version.";
  if (!isRecord(candidate) || !isText(candidate.id) || !isText(candidate.fingerprint)) {
    return "The report has no candidate version and fingerprint.";
  }
  if (!isRecord(testSet) || !isText(testSet.fingerprint)) return "The report has no test set fingerprint.";
  if (!isRecord(gate) || gate.passed !== true) return "The report's release gate did not pass.";
  const generatedAt = typeof json.generatedAt === "string" ? Date.parse(json.generatedAt) : NaN;
  if (!Number.isFinite(generatedAt)) return "The report has no generatedAt time.";
  if (!Array.isArray(cases) || cases.length === 0) return "The report has no cases.";

  const parsed: ReleaseReportInput["cases"] = [];
  const seen = new Set<string>();
  for (const entry of cases) {
    if (!isRecord(entry) || !isText(entry.id) || (entry.source !== "seed" && entry.source !== "game")
      || (entry.expectedVerdict !== "fine" && entry.expectedVerdict !== "not_ok")
      || !isRecord(entry.baseline) || !isKind(entry.baseline.kind)
      || !isRecord(entry.candidate) || !isKind(entry.candidate.kind)) {
      return "Every report case needs an id, source, expected verdict and both results.";
    }
    if (seen.has(entry.id)) return `The report lists case ${entry.id} twice.`;
    seen.add(entry.id);
    parsed.push({
      id: entry.id,
      source: entry.source,
      expectedVerdict: entry.expectedVerdict,
      baseline: entry.baseline.kind,
      candidate: entry.candidate.kind,
    });
  }
  return {
    generatedAt: Math.floor(generatedAt / 1000),
    testSetFingerprint: testSet.fingerprint,
    baselineId: baseline.id,
    candidateId: candidate.id,
    candidateFingerprint: candidate.fingerprint,
    cases: parsed,
  };
}

/** Rebuilds the counts the gate reads from per-case results, so stored summaries are not trusted. */
function gateCounts(
  cases: ReleaseReportInput["cases"],
  side: "baseline" | "candidate",
): Pick<FilterVersionRun, "catches" | "falsePositives"> & { summary: Pick<FilterVersionRun["summary"], "errors"> } {
  let catches = 0;
  let falsePositives = 0;
  let errors = 0;
  for (const testCase of cases) {
    const kind = testCase[side];
    if (kind === "error") errors += 1;
    if (kind === "catch") catches += 1;
    if (testCase.expectedVerdict === "fine" && (kind === "false_positive" || kind === "off_limits_unexpected")) {
      falsePositives += 1;
    }
  }
  return { catches, falsePositives, summary: { errors } };
}

/**
 * A report may ship only for the version this deployment runs, with the exact
 * configuration that was gated, and only if its cases pass the #25 gate again.
 */
export async function checkReleaseReport(
  report: ReleaseReportInput,
  activeVersionId = ACTIVE_FILTER_VERSION_ID,
): Promise<string | null> {
  if (report.candidateId === report.baselineId) return "The candidate and baseline must differ.";
  if (report.candidateId !== activeVersionId) {
    return `Only the active filter version (${activeVersionId}) can be released; the report is for ${report.candidateId}.`;
  }
  const config = findFilterVersion(report.candidateId);
  if (!config) return `Filter version ${report.candidateId} is not registered.`;
  if ((await filterFingerprint(config)) !== report.candidateFingerprint) {
    return `The report gated a different ${report.candidateId} configuration than this deployment runs.`;
  }
  const gate = releaseGate(
    gateCounts(report.cases, "baseline") as FilterVersionRun,
    gateCounts(report.cases, "candidate") as FilterVersionRun,
  );
  return gate.passed ? null : `The report's cases do not pass the release gate: ${gate.reasons.join(" ")}`;
}

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += ID_CHUNK) out.push(items.slice(i, i + ID_CHUNK));
  return out;
}

const placeholders = (count: number) => Array.from({ length: count }, () => "?").join(", ");

/**
 * Records a gate-passing release of the active version (#26) and marks the
 * slips it catches as patched. Each slip keeps the first release that patched
 * it; a slip the new version no longer catches loses its mark. Scores and
 * messages are never written, so players keep their points.
 */
export async function recordFilterRelease(
  db: MessagesDatabase,
  json: unknown,
  now = Math.floor(Date.now() / 1000),
  activeVersionId = ACTIVE_FILTER_VERSION_ID,
): Promise<RecordReleaseResult> {
  const report = parseReleaseReport(json);
  if (typeof report === "string") return { ok: false, status: 400, error: report };
  const problem = await checkReleaseReport(report, activeVersionId);
  if (problem) return { ok: false, status: 422, error: problem };
  if (report.generatedAt > now) return { ok: false, status: 422, error: "The report is dated after the release time." };

  const existing = await db.prepare("SELECT 1 AS found FROM filter_releases WHERE version = ? LIMIT 1")
    .bind(report.candidateId).first!<{ found: number }>();
  if (existing) return { ok: false, status: 409, error: `Filter version ${report.candidateId} is already released.` };

  const baseline = gateCounts(report.cases, "baseline");
  const candidate = gateCounts(report.cases, "candidate");
  const gameSlips = report.cases.filter((c) => c.source === "game" && c.expectedVerdict === "not_ok");
  const caught = gameSlips.filter((c) => c.candidate === "catch").map((c) => c.id);
  const regressed = gameSlips.filter((c) => c.candidate !== "catch").map((c) => c.id);

  await db.batch([
    db.prepare(`
      INSERT INTO filter_releases (
        version, released_at, baseline_version, config_fingerprint, test_set_fingerprint,
        baseline_catches, catches, baseline_false_positives, false_positives
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      report.candidateId, now, report.baselineId, report.candidateFingerprint, report.testSetFingerprint,
      baseline.catches, candidate.catches, baseline.falsePositives, candidate.falsePositives,
    ),
    // The live filter lets these through again, so they are no longer patched.
    ...chunks(regressed).map((ids) => db.prepare(
      `DELETE FROM patched_slips WHERE test_case_id IN (${placeholders(ids.length)})`,
    ).bind(...ids)),
    // Only confirmed slips (passed the filter, players said Not OK) can be patched.
    ...chunks(caught).map((ids) => db.prepare(`
      INSERT INTO patched_slips (test_case_id, version, confirmed_at, released_at, patch_seconds)
      SELECT id, ?, confirmed_at, ?, CASE WHEN confirmed_at IS NULL THEN NULL ELSE MAX(0, ? - confirmed_at) END
      FROM test_cases
      WHERE source = 'game' AND source_status = 'slip' AND id IN (${placeholders(ids.length)})
      ON CONFLICT (test_case_id) DO NOTHING
    `).bind(report.candidateId, now, now, ...ids)),
  ]);

  const release = (await loadReleases(db)).find((entry) => entry.version === report.candidateId);
  if (!release) throw new Error("Recorded release is missing");
  return { ok: true, release };
}

interface ReleaseRow {
  version: string;
  released_at: number;
  baseline_version: string;
  catches: number;
  baseline_catches: number;
  false_positives: number;
  baseline_false_positives: number;
}

/** Median rounded to whole seconds; null for no values. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/** Every release, newest first, with patch-time metrics for the maintainer. */
export async function loadReleases(db: MessagesDatabase): Promise<FilterRelease[]> {
  const releases = databaseRows(await db.prepare(`
    SELECT version, released_at, baseline_version, catches, baseline_catches,
      false_positives, baseline_false_positives
    FROM filter_releases ORDER BY released_at DESC, version DESC
  `).bind().all!<ReleaseRow>());
  const patches = databaseRows(await db.prepare(`
    SELECT version, patch_seconds FROM patched_slips
  `).bind().all!<{ version: string; patch_seconds: number | null }>());

  return releases.map((row) => {
    const own = patches.filter((patch) => patch.version === row.version);
    const timed = own.flatMap((patch) => (patch.patch_seconds === null ? [] : [patch.patch_seconds]));
    return {
      version: row.version,
      releasedAt: row.released_at,
      baselineVersion: row.baseline_version,
      catches: row.catches,
      baselineCatches: row.baseline_catches,
      falsePositives: row.false_positives,
      baselineFalsePositives: row.baseline_false_positives,
      patchedSlips: own.length,
      patchTime: {
        measured: timed.length,
        medianSeconds: median(timed),
        withinTarget: timed.filter((seconds) => seconds <= PATCH_TIME_TARGET_SECONDS).length,
      },
    };
  });
}

/** Releases for the public board, newest first. */
export async function loadPublicReleases(db: MessagesDatabase): Promise<PublicFilterRelease[]> {
  return databaseRows(await db.prepare(`
    SELECT r.version, r.released_at AS releasedAt,
      (SELECT COUNT(*) FROM patched_slips p WHERE p.version = r.version) AS patchedSlips
    FROM filter_releases r ORDER BY r.released_at DESC, r.version DESC
  `).bind().all!<PublicFilterRelease>());
}

/** Release that patched each live slip message, keyed by message id. */
export async function loadPatchedVersions(
  db: MessagesDatabase,
  messageIds: readonly string[],
): Promise<Map<string, string>> {
  const patched = new Map<string, string>();
  for (const ids of chunks([...new Set(messageIds)])) {
    const rows = databaseRows(await db.prepare(`
      SELECT tc.source_message_id AS message_id, p.version
      FROM patched_slips p JOIN test_cases tc ON tc.id = p.test_case_id
      WHERE tc.source_message_id IN (${placeholders(ids.length)})
    `).bind(...ids).all!<{ message_id: string; version: string }>());
    for (const row of rows) patched.set(row.message_id, row.version);
  }
  return patched;
}
