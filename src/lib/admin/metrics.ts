import "server-only";

import { median, PATCH_TIME_TARGET_SECONDS } from "@/lib/filter-release/releases";
import type { MessagesDatabase } from "@/lib/messages/db";
import { DAILY_POSTS_SITE_WIDE } from "@/lib/messages/limits";

/**
 * Beta success measures for the maintainer (#28), computed from stored D1 data.
 * Every metric names its denominator and time window. Game rows are kept for
 * 90 days, so the window is capped there; test cases and releases are permanent.
 */

export const DEFAULT_METRICS_WINDOW_DAYS = 28;
export const MAX_METRICS_WINDOW_DAYS = 90;
/** PRD: measured Jev cost is about $0.0002 a check (95 checks cost $0.021). */
export const DEFAULT_JEV_COST_PER_CHECK_USD = 0.0002;
export const JEV_COST_ENV = "JEV_COST_PER_CHECK_USD";
/** PRD free-plan fit: about 4 rows written per post (message, review, verdict, score). */
export const ESTIMATED_ROWS_WRITTEN_PER_POST = 4;

/** Cloudflare free-plan daily limits, from the PRD's free-plan fit table. */
export const FREE_PLAN_LIMITS = {
  d1RowsReadPerDay: 5_000_000,
  d1RowsWrittenPerDay: 100_000,
  workerRequestsPerDay: 100_000,
} as const;

const DAY = 24 * 60 * 60;

export interface RateMetric {
  /** numeratorCount / denominatorCount, or null when the denominator is 0. */
  value: number | null;
  numeratorCount: number;
  denominatorCount: number;
  numerator: string;
  denominator: string;
  window: string;
}

export interface VerdictBucket {
  label: string;
  decided: number;
  slip: number;
  clean: number;
  caught: number;
  falsePositive: number;
}

export type BucketName = "twoVote" | "threeReview";

export interface SuccessMetrics {
  generatedAt: number;
  window: { days: number; start: number; end: number; label: string };
  verdicts: {
    window: string;
    /** Passed or blocked messages posted in the window (off-limits never reach review). */
    reviewable: number;
    pending: number;
    decided: number;
    buckets: Record<BucketName | "other", VerdictBucket>;
  };
  catchRate: RateMetric & { byBucket: Record<BucketName, RateMetric> };
  falsePositiveRate: RateMetric & { byBucket: Record<BucketName, RateMetric> };
  threeReviewAgreement: RateMetric;
  confirmedSlipsPerWeek: {
    window: string;
    numerator: string;
    denominator: string;
    total: number;
    weeks: { week: string; slips: number; partial: boolean }[];
  };
  confirmedToPatched: {
    window: string;
    denominator: string;
    medianSeconds: number | null;
    patched: number;
    unpatched: number;
    withinTarget: number;
    targetSeconds: number;
  };
  usage: {
    window: string;
    jevChecks: { total: number; posts: number; nameClaims: number; denominator: string; window: string };
    cost: {
      perCheckUsd: number;
      rateSource: "env" | "default";
      estimatedUsd: number;
      projected30DayUsd: number;
      denominator: string;
      window: string;
    };
    d1: {
      posts: { total: number; perDay: number; peakDay: number };
      reviews: { total: number; perDay: number; peakDay: number };
      estimatedRowsWrittenPeakDay: number;
      /** Rows D1 reported reading for this report, or null when the driver gives no meta. */
      reportRowsRead: number | null;
    };
    freePlan: { limits: typeof FREE_PLAN_LIMITS; notes: string[] };
  };
}

export interface MetricsOptions {
  /** Unix seconds; defaults to the current time. */
  now?: number;
  days?: number;
  costPerCheckUsd?: number;
  costRateSource?: "env" | "default";
}

/** The per-check Jev rate from JEV_COST_PER_CHECK_USD, or the PRD default when unset or invalid. */
export function readJevCostPerCheck(
  env: Record<string, string | undefined> = process.env,
): { perCheckUsd: number; source: "env" | "default" } {
  const raw = env[JEV_COST_ENV]?.trim();
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 0
    ? { perCheckUsd: parsed, source: "env" }
    : { perCheckUsd: DEFAULT_JEV_COST_PER_CHECK_USD, source: "default" };
}

/** Parses the `days` query value; null when it is not a whole number from 1 to 90. */
export function parseWindowDays(raw: string | null): number | null {
  if (raw === null || raw === "") return DEFAULT_METRICS_WINDOW_DAYS;
  if (!/^\d+$/.test(raw)) return null;
  const days = Number(raw);
  return days >= 1 && days <= MAX_METRICS_WINDOW_DAYS ? days : null;
}

/** ISO 8601 week of a Unix time in UTC, for example 2026-W42. */
export function isoWeek(seconds: number): string {
  const date = new Date(seconds * 1000);
  const weekday = date.getUTCDay() || 7;
  const thursday = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 4 - weekday);
  const year = new Date(thursday).getUTCFullYear();
  const week = Math.ceil(((thursday - Date.UTC(year, 0, 1)) / (DAY * 1000) + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Start of the ISO week (Monday 00:00 UTC) containing a Unix time. */
function isoWeekStart(seconds: number): number {
  const date = new Date(seconds * 1000);
  const weekday = date.getUTCDay() || 7;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - weekday + 1) / 1000;
}

const rate = (
  numeratorCount: number,
  denominatorCount: number,
  numerator: string,
  denominator: string,
  window: string,
): RateMetric => ({
  value: denominatorCount === 0 ? null : numeratorCount / denominatorCount,
  numeratorCount,
  denominatorCount,
  numerator,
  denominator,
  window,
});

const usd = (value: number) => Math.round(value * 1e6) / 1e6;

/** D1 returns a result envelope with meta; light test adapters may return bare rows. */
function readResult<T>(result: unknown): { rows: T[]; rowsRead: number | null } {
  if (Array.isArray(result)) return { rows: result as T[], rowsRead: null };
  const envelope = result as { results?: T[]; meta?: { rows_read?: number } };
  const rowsRead = envelope.meta?.rows_read;
  return { rows: envelope.results ?? [], rowsRead: typeof rowsRead === "number" ? rowsRead : null };
}

/**
 * Per decided message: how many votes count toward it now and whether they
 * agree. Eligibility mirrors consensusStatement in reviews/verdicts.ts: first
 * three non-skipped votes from reviewers in good standing, other than the
 * author, with at most one hand-picked.
 */
const VERDICTS_SQL = `
  WITH windowed AS (
    SELECT id, author_id, status FROM messages
    WHERE created_at >= ?1 AND created_at <= ?2 AND filter_outcome IN ('passed', 'blocked')
  ), eligible AS (
    SELECT r.message_id, r.verdict, r.assignment, r.created_at, r.rowid AS sequence,
      SUM(CASE WHEN r.assignment = 'hand_picked' THEN 1 ELSE 0 END)
        OVER (PARTITION BY r.message_id ORDER BY r.created_at, r.rowid) AS hand_picked_count
    FROM windowed m
    JOIN reviews r ON r.message_id = m.id
    JOIN players p ON p.id = r.player_id
    WHERE r.player_id <> m.author_id AND p.reviewer_standing = 'good' AND r.skipped = 0
      AND r.seed_case_id IS NULL AND r.verdict IN ('fine', 'not_ok')
  ), ranked AS (
    SELECT message_id, verdict,
      ROW_NUMBER() OVER (PARTITION BY message_id ORDER BY created_at, sequence) AS position
    FROM eligible WHERE assignment = 'queue' OR hand_picked_count = 1
  ), votes AS (
    SELECT message_id, COUNT(*) AS counted, COUNT(DISTINCT verdict) AS distinct_verdicts
    FROM ranked WHERE position <= 3 GROUP BY message_id
  )
  SELECT m.status, COALESCE(v.counted, 0) AS counted,
    COALESCE(v.distinct_verdicts, 0) AS distinct_verdicts, COUNT(*) AS messages
  FROM windowed m LEFT JOIN votes v ON v.message_id = m.id
  GROUP BY m.status, counted, distinct_verdicts
`;

/** Confirmed slips by confirmation time, with the release that patched each, if any. */
const SLIPS_SQL = `
  SELECT tc.confirmed_at, p.patch_seconds, p.test_case_id IS NOT NULL AS patched
  FROM test_cases tc LEFT JOIN patched_slips p ON p.test_case_id = tc.id
  WHERE tc.source = 'game' AND tc.source_status = 'slip'
    AND tc.confirmed_at >= ?1 AND tc.confirmed_at <= ?2
`;

const POSTS_BY_DAY_SQL = `
  SELECT created_at / ${DAY} AS day, COUNT(*) AS count FROM messages
  WHERE created_at >= ?1 AND created_at <= ?2 GROUP BY day
`;
const REVIEWS_BY_DAY_SQL = `
  SELECT created_at / ${DAY} AS day, COUNT(*) AS count FROM reviews
  WHERE created_at >= ?1 AND created_at <= ?2 GROUP BY day
`;
const NAME_CLAIMS_SQL = `SELECT COUNT(*) AS count FROM players WHERE created_at >= ?1 AND created_at <= ?2`;

interface VerdictRow { status: string; counted: number; distinct_verdicts: number; messages: number }
interface SlipRow { confirmed_at: number; patch_seconds: number | null; patched: number }
interface CountRow { day?: number; count: number }

const STATUS_KEYS: Record<string, keyof Omit<VerdictBucket, "label" | "decided">> = {
  slip: "slip",
  clean: "clean",
  caught: "caught",
  false_positive: "falsePositive",
};

const emptyBucket = (label: string): VerdictBucket =>
  ({ label, decided: 0, slip: 0, clean: 0, caught: 0, falsePositive: 0 });

function dailyTotals(rows: CountRow[], days: number) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return {
    total,
    perDay: Math.round((total / days) * 100) / 100,
    peakDay: rows.reduce((peak, row) => Math.max(peak, row.count), 0),
  };
}

const percent = (part: number, whole: number) => `${((part / whole) * 100).toFixed(part / whole < 0.01 ? 3 : 1)}%`;

/** Computes the beta success report over the last `days` days (#28). */
export async function loadSuccessMetrics(db: MessagesDatabase, options: MetricsOptions = {}): Promise<SuccessMetrics> {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const days = Math.min(Math.max(Math.floor(options.days ?? DEFAULT_METRICS_WINDOW_DAYS), 1), MAX_METRICS_WINDOW_DAYS);
  const configured = options.costPerCheckUsd === undefined ? readJevCostPerCheck() : null;
  const perCheckUsd = configured?.perCheckUsd ?? options.costPerCheckUsd!;
  const rateSource = configured?.source ?? options.costRateSource ?? "env";
  const start = now - days * DAY;
  const label = `last ${days}d`;
  const byPost = `${label}, by post time (UTC)`;

  const results = await db.batch([
    db.prepare(VERDICTS_SQL).bind(start, now),
    db.prepare(SLIPS_SQL).bind(start, now),
    db.prepare(POSTS_BY_DAY_SQL).bind(start, now),
    db.prepare(REVIEWS_BY_DAY_SQL).bind(start, now),
    db.prepare(NAME_CLAIMS_SQL).bind(start, now),
  ]);
  const verdictResult = readResult<VerdictRow>(results[0]);
  const slipResult = readResult<SlipRow>(results[1]);
  const postsResult = readResult<CountRow>(results[2]);
  const reviewsResult = readResult<CountRow>(results[3]);
  const namesResult = readResult<CountRow>(results[4]);
  const reads = [verdictResult, slipResult, postsResult, reviewsResult, namesResult].map((result) => result.rowsRead);
  const reportRowsRead = reads.every((read) => read !== null)
    ? reads.reduce<number>((sum, read) => sum + read!, 0)
    : null;

  // Verdict buckets: early two-vote verdicts vs verdicts with three counted reviews.
  const buckets: SuccessMetrics["verdicts"]["buckets"] = {
    twoVote: emptyBucket("Early verdicts: decided by 2 agreeing votes, no third counted review yet"),
    threeReview: emptyBucket("Verdicts with 3 counted reviews"),
    other: emptyBucket("Decided, but fewer than 2 votes still count (a reviewer lost standing)"),
  };
  let reviewable = 0;
  let pending = 0;
  let agreeing = 0;
  for (const row of verdictResult.rows) {
    reviewable += row.messages;
    if (row.status === "pending") pending += row.messages;
    const key = STATUS_KEYS[row.status];
    if (!key) continue;
    const bucket = row.counted >= 3 ? buckets.threeReview : row.counted === 2 ? buckets.twoVote : buckets.other;
    bucket.decided += row.messages;
    bucket[key] += row.messages;
    if (row.counted >= 3 && row.distinct_verdicts === 1) agreeing += row.messages;
  }
  const all = Object.values(buckets);
  const sum = (field: keyof Omit<VerdictBucket, "label">, from: VerdictBucket[] = all) =>
    from.reduce((total, bucket) => total + bucket[field], 0);

  const catchNumerator = "caught (filter blocked, players said Not OK)";
  const catchDenominator = "decided Not OK verdicts (caught + slip)";
  const catchRate = (from: VerdictBucket[], scope: string) =>
    rate(sum("caught", from), sum("caught", from) + sum("slip", from), catchNumerator, `${catchDenominator}${scope}`, byPost);
  const fpNumerator = "false positives (filter blocked, players said Fine)";
  const fpDenominator = "decided Fine verdicts (false positive + clean)";
  const fpRate = (from: VerdictBucket[], scope: string) =>
    rate(sum("falsePositive", from), sum("falsePositive", from) + sum("clean", from), fpNumerator, `${fpDenominator}${scope}`, byPost);
  const twoScope = ", early two-vote verdicts only";
  const threeScope = ", verdicts with 3 reviews only";

  // Confirmed slips per ISO week, with empty weeks filled in.
  const bySlipTime = `${label}, by confirmation time (UTC)`;
  const weekCounts = new Map<string, number>();
  for (let weekStart = isoWeekStart(start); weekStart <= now; weekStart += 7 * DAY) {
    weekCounts.set(isoWeek(weekStart), 0);
  }
  for (const slip of slipResult.rows) {
    const week = isoWeek(slip.confirmed_at);
    weekCounts.set(week, (weekCounts.get(week) ?? 0) + 1);
  }
  const firstWeek = isoWeek(start);
  const lastWeek = isoWeek(now);
  const startIsMonday = isoWeekStart(start) === start;

  const patchSeconds = slipResult.rows.flatMap((slip) =>
    slip.patched && slip.patch_seconds !== null ? [slip.patch_seconds] : []);

  const posts = dailyTotals(postsResult.rows, days);
  const reviews = dailyTotals(reviewsResult.rows, days);
  const nameClaims = namesResult.rows[0]?.count ?? 0;
  const checks = posts.total + nameClaims;
  const estimatedUsd = usd(checks * perCheckUsd);
  const projected30DayUsd = usd((checks / days) * 30 * perCheckUsd);
  const estimatedRowsWrittenPeakDay = posts.peakDay * ESTIMATED_ROWS_WRITTEN_PER_POST;

  const notes = [
    `Peak day: ${posts.peakDay} posts, about ${estimatedRowsWrittenPeakDay.toLocaleString("en-US")} D1 rows written `
      + `(${ESTIMATED_ROWS_WRITTEN_PER_POST} per post) of ${FREE_PLAN_LIMITS.d1RowsWrittenPerDay.toLocaleString("en-US")} a day `
      + `(${percent(estimatedRowsWrittenPeakDay, FREE_PLAN_LIMITS.d1RowsWrittenPerDay)}).`,
    reportRowsRead === null
      ? "D1 did not report rows read for this report."
      : `This report read ${reportRowsRead.toLocaleString("en-US")} D1 rows of ${FREE_PLAN_LIMITS.d1RowsReadPerDay.toLocaleString("en-US")} `
        + `a day (${percent(reportRowsRead, FREE_PLAN_LIMITS.d1RowsReadPerDay)}).`,
    `The site-wide cap of ${DAILY_POSTS_SITE_WIDE.toLocaleString("en-US")} posts a day trips before any D1 limit.`,
    `Worker requests are not stored in D1; check the Cloudflare dashboard against ${FREE_PLAN_LIMITS.workerRequestsPerDay.toLocaleString("en-US")} `
      + "a day, shared across the account. Feed refreshes (240 an hour per open tab) dominate.",
    `Jev is the only paid service: about $${projected30DayUsd.toFixed(2)} over 30 days at this window's pace `
      + `($${perCheckUsd} a check${rateSource === "default" ? ", the default rate" : ` from ${JEV_COST_ENV}`}).`,
  ];

  return {
    generatedAt: now,
    window: { days, start, end: now, label },
    verdicts: { window: byPost, reviewable, pending, decided: sum("decided"), buckets },
    catchRate: {
      ...catchRate(all, ""),
      byBucket: { twoVote: catchRate([buckets.twoVote], twoScope), threeReview: catchRate([buckets.threeReview], threeScope) },
    },
    falsePositiveRate: {
      ...fpRate(all, ""),
      byBucket: { twoVote: fpRate([buckets.twoVote], twoScope), threeReview: fpRate([buckets.threeReview], threeScope) },
    },
    threeReviewAgreement: rate(
      agreeing,
      buckets.threeReview.decided,
      "verdicts where all 3 counted reviews match",
      "verdicts with 3 reviews (early two-vote verdicts excluded)",
      byPost,
    ),
    confirmedSlipsPerWeek: {
      window: bySlipTime,
      numerator: "confirmed slips (game test cases with a slip verdict)",
      denominator: "ISO week (Monday start, UTC); the first and last weeks may be partial",
      total: slipResult.rows.length,
      weeks: [...weekCounts].map(([week, slips]) => ({
        week,
        slips,
        partial: week === lastWeek || (week === firstWeek && !startIsMonday),
      })),
    },
    confirmedToPatched: {
      window: bySlipTime,
      denominator: "confirmed slips in the window that a release has patched; unpatched slips are counted separately",
      medianSeconds: median(patchSeconds),
      patched: patchSeconds.length,
      unpatched: slipResult.rows.filter((slip) => !slip.patched).length,
      withinTarget: patchSeconds.filter((seconds) => seconds <= PATCH_TIME_TARGET_SECONDS).length,
      targetSeconds: PATCH_TIME_TARGET_SECONDS,
    },
    usage: {
      window: `${label}, by post, claim and review time (UTC)`,
      jevChecks: {
        total: checks,
        posts: posts.total,
        nameClaims,
        denominator: "stored Jev checks: one per message posted plus one per name claimed (rejected names are not stored)",
        window: label,
      },
      cost: {
        perCheckUsd,
        rateSource,
        estimatedUsd,
        projected30DayUsd,
        denominator: "stored Jev checks in the window",
        window: label,
      },
      d1: { posts, reviews, estimatedRowsWrittenPeakDay, reportRowsRead },
      freePlan: { limits: FREE_PLAN_LIMITS, notes },
    },
  };
}
