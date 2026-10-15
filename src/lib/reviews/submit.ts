import "server-only";

import { mayEnterReviewQueue } from "@/lib/messages/disposition";
import { serializeReviewerMessage } from "@/lib/presentation";
import type { CategoryId } from "@/lib/moderation/categories";
import { CATEGORY_BY_ID } from "@/lib/moderation/categories";
import type { AuthenticatedPlayer } from "@/lib/players/auth";
import { consumeReviewAssignment, getConsumableReviewAssignment } from "./assignments";
import { loadMessageReviewPresentation, loadSeedReviewPresentation } from "./context";
import type { ReviewsDatabase } from "./db";
import {
  parseAndValidateFlaggedSpans,
  serializeFlaggedSpans,
  type FlaggedSpan,
} from "./spans";

export type ReviewSubmitAction = "fine" | "not_ok" | "skip";

export type ReviewSubmitResult =
  | { ok: true; reviewId: string; skipped: boolean }
  | { ok: false; status: number; error: string; code?: string };

const MAX_REASON_CHARS = 280;

export interface ReviewSubmitInput {
  assignmentId: string;
  action: ReviewSubmitAction;
  rule?: unknown;
  reason?: unknown;
  flaggedSpans?: unknown;
}

function parseAction(raw: unknown): ReviewSubmitAction | null {
  return raw === "fine" || raw === "not_ok" || raw === "skip" ? raw : null;
}

function parseRule(raw: unknown): CategoryId | null {
  return typeof raw === "string" && raw in CATEGORY_BY_ID ? (raw as CategoryId) : null;
}

async function loadSeedExpected(
  db: ReviewsDatabase,
  seedCaseId: string,
): Promise<{ expected_verdict: "fine" | "not_ok"; rule: string | null } | null> {
  return (
    db
      .prepare(
        `SELECT expected_verdict, rule FROM test_cases
         WHERE id = ? AND source = 'seed' LIMIT 1`,
      )
      .bind(seedCaseId) as {
      first<T>(): Promise<T | null>;
    }
  ).first<{ expected_verdict: "fine" | "not_ok"; rule: string | null }>();
}

export async function submitReview(
  db: ReviewsDatabase,
  player: AuthenticatedPlayer,
  input: ReviewSubmitInput,
): Promise<ReviewSubmitResult> {
  const assignmentId =
    typeof input.assignmentId === "string" ? input.assignmentId.trim() : "";
  if (!assignmentId) {
    return { ok: false, status: 400, error: "assignmentId is required." };
  }

  const action = parseAction(input.action);
  if (!action) {
    return {
      ok: false,
      status: 400,
      error: "Choose Fine, Not OK, or Skip.",
    };
  }

  const now = Math.floor(Date.now() / 1000);
  const assignment = await getConsumableReviewAssignment(db, assignmentId, player.id, now);
  if (!assignment) {
    return {
      ok: false,
      status: 409,
      error: "That review assignment expired or was already used. Get a new one.",
      code: "assignment_unavailable",
    };
  }

  const presentation = assignment.message_id
    ? await loadMessageReviewPresentation(db, assignment.message_id)
    : await loadSeedReviewPresentation(db, assignment.seed_case_id!);
  if (assignment.message_id && (!presentation || !mayEnterReviewQueue(presentation.filterOutcome, presentation.status))) {
    await consumeReviewAssignment(db, assignment.id, player.id, now);
    return { ok: false, status: 409, error: "That message is no longer available to judge. Get a new one.", code: "message_unavailable" };
  }
  if (!presentation) {
    return { ok: false, status: 404, error: "That message is not available to judge." };
  }

  const reviewedText = serializeReviewerMessage(presentation).text;

  let verdict: "fine" | "not_ok" | null = null;
  let rule: string | null = null;
  let reason: string | null = null;
  let skipped = 0;
  let spans: FlaggedSpan[] = [];
  let seedCorrect: number | null = null;

  if (action === "skip") {
    skipped = 1;
    if (input.flaggedSpans !== undefined && input.flaggedSpans !== null) {
      const parsed = parseAndValidateFlaggedSpans(input.flaggedSpans, reviewedText.length);
      if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
      if (parsed.spans.length > 0) {
        return { ok: false, status: 400, error: "Skip cannot include flagged spans." };
      }
    }
    if (input.rule !== undefined && input.rule !== null && input.rule !== "") {
      return { ok: false, status: 400, error: "Skip does not take a rule." };
    }
    if (typeof input.reason === "string" && input.reason.trim() !== "") {
      return { ok: false, status: 400, error: "Skip does not take a reason." };
    }
  } else if (action === "fine") {
    verdict = "fine";
    if (input.flaggedSpans !== undefined && input.flaggedSpans !== null) {
      const parsed = parseAndValidateFlaggedSpans(input.flaggedSpans, reviewedText.length);
      if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
      if (parsed.spans.length > 0) {
        return { ok: false, status: 400, error: "Fine reviews cannot include flagged spans." };
      }
    }
    if (input.rule !== undefined && input.rule !== null && input.rule !== "") {
      return { ok: false, status: 400, error: "Fine reviews do not take a rule." };
    }
    if (typeof input.reason === "string" && input.reason.trim() !== "") {
      return { ok: false, status: 400, error: "Fine reviews do not take a reason." };
    }
  } else {
    verdict = "not_ok";
    const parsedRule = parseRule(input.rule);
    if (!parsedRule) {
      return {
        ok: false,
        status: 400,
        error: "Not OK needs one of the nine review rules.",
      };
    }
    rule = parsedRule;
    if (typeof input.reason !== "string" || input.reason.trim() === "") {
      return {
        ok: false,
        status: 400,
        error: "Not OK needs a one-line reason.",
      };
    }
    const trimmedReason = input.reason.trim();
    if (trimmedReason.length > MAX_REASON_CHARS) {
      return {
        ok: false,
        status: 400,
        error: `Keep the reason to ${MAX_REASON_CHARS} characters or fewer.`,
      };
    }
    reason = trimmedReason;
    const parsedSpans = parseAndValidateFlaggedSpans(
      input.flaggedSpans,
      reviewedText.length,
    );
    if (!parsedSpans.ok) {
      return { ok: false, status: 400, error: parsedSpans.error };
    }
    spans = parsedSpans.spans;
  }

  if (assignment.seed_case_id && skipped === 0 && verdict) {
    const expected = await loadSeedExpected(db, assignment.seed_case_id);
    if (!expected) {
      return { ok: false, status: 404, error: "That message is not available to judge." };
    }
    const verdictMatches = expected.expected_verdict === verdict;
    const ruleMatches =
      expected.expected_verdict === "fine" ||
      (expected.rule != null && expected.rule === rule);
    seedCorrect = verdictMatches && ruleMatches ? 1 : 0;
  }

  const reviewId = crypto.randomUUID();
  const flaggedJson = serializeFlaggedSpans(spans);

  const insertReview = db
    .prepare(
      `INSERT INTO reviews (
         id, message_id, seed_case_id, player_id, verdict, rule, reason,
         skipped, seed_correct, assignment, created_at, flagged_spans
       )
       SELECT ?, message_id, seed_case_id, player_id, ?, ?, ?, ?, ?, assignment, ?, ?
       FROM review_assignments
       WHERE id = ? AND player_id = ? AND consumed_at IS NULL AND expires_at > ?
         AND (seed_case_id IS NOT NULL OR EXISTS (
           SELECT 1 FROM messages m
           WHERE m.id = review_assignments.message_id
             AND m.status = 'pending'
             AND m.filter_outcome IN ('passed', 'blocked')
             AND m.author_id <> review_assignments.player_id
         ))`,
    )
    .bind(
      reviewId,
      verdict,
      rule,
      reason,
      skipped,
      seedCorrect,
      now,
      flaggedJson,
      assignment.id,
      player.id,
      now,
    );

  const consumeAssignment = db
    .prepare(
      `UPDATE review_assignments
       SET consumed_at = ?
       WHERE id = ? AND player_id = ? AND consumed_at IS NULL AND expires_at > ?`,
    )
    .bind(now, assignment.id, player.id, now);

  try {
    await db.batch([insertReview, consumeAssignment]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/UNIQUE|unique/i.test(message)) {
      return {
        ok: false,
        status: 409,
        error: "You already reviewed this message.",
        code: "already_reviewed",
      };
    }
    console.error("[reviews.submit]", err);
    return {
      ok: false,
      status: 500,
      error: "We could not save your review. Please try again.",
    };
  }

  // Confirm the insert selected a live assignment (0-row INSERT is not an error in SQLite).
  const saved = await (
    db.prepare(`SELECT id FROM reviews WHERE id = ? LIMIT 1`).bind(reviewId) as {
      first<T>(): Promise<T | null>;
    }
  ).first<{ id: string }>();
  if (!saved) {
    if (assignment.message_id) {
      const current = await loadMessageReviewPresentation(db, assignment.message_id);
      if (!current || !mayEnterReviewQueue(current.filterOutcome, current.status)) {
        return { ok: false, status: 409, error: "That message is no longer available to judge. Get a new one.", code: "message_unavailable" };
      }
    }
    return {
      ok: false,
      status: 409,
      error: "That review assignment expired or was already used. Get a new one.",
      code: "assignment_unavailable",
    };
  }

  return { ok: true, reviewId, skipped: skipped === 1 };
}
