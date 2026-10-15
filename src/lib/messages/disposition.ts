import "server-only";

import type { FilterOutcome, FilterScores, ModerationResult } from "@/lib/moderation/types";

export type MessageStatus =
  | "pending"
  | "slip"
  | "clean"
  | "caught"
  | "false_positive"
  | "excluded";

/** Row fields the schema requires when persisting a moderation outcome. */
export interface MessageDisposition {
  filterOutcome: FilterOutcome;
  status: MessageStatus;
  text: string | null;
  maskedText: string | null;
  filterScores: FilterScores;
}

export function filterScoresFromResult(result: ModerationResult): FilterScores {
  return { ...result.scores, off_limits: result.offLimitsScore };
}

/**
 * Maps a live moderation result to immutable filter fields and nullable text columns.
 * Off-limits rows store no message body; reviewable blocked rows keep masked text only at delivery boundaries.
 */
export function dispositionFromModeration(
  result: ModerationResult,
  rawText: string,
  maskedText: string,
): MessageDisposition {
  const filterScores = filterScoresFromResult(result);

  if (result.outcome === "off_limits") {
    return {
      filterOutcome: "off_limits",
      status: "excluded",
      text: null,
      maskedText: null,
      filterScores,
    };
  }

  return {
    filterOutcome: result.outcome,
    status: "pending",
    text: rawText,
    maskedText,
    filterScores,
  };
}

/** Off-limits and maintainer-excluded rows never appear in the feed. */
export function mayAppearInFeed(
  filterOutcome: FilterOutcome,
  status: MessageStatus,
): boolean {
  return filterOutcome === "passed" && status !== "excluded";
}

/** Blocked reviewable messages stay in the queue; off-limits rows do not. */
export function mayEnterReviewQueue(filterOutcome: FilterOutcome): boolean {
  return filterOutcome === "passed" || filterOutcome === "blocked";
}

/** Context snapshots and serializers must drop undeliverable predecessors. */
export function mayAppearInContext(
  filterOutcome: FilterOutcome,
  status: MessageStatus,
): boolean {
  return filterOutcome !== "off_limits" && status !== "excluded";
}

/** Permanent test cases never include off-limits content or maintainer-excluded rows. */
export function mayEnterTestCase(
  filterOutcome: FilterOutcome,
  status: MessageStatus,
): boolean {
  return mayAppearInContext(filterOutcome, status);
}

/** Maintainer deletion hard-deletes the row; it is not the same as filter exclusion. */
export function maintainerRemovalEntersTestSet(): false {
  return false;
}

export function isOffLimitsDisposition(disposition: Pick<MessageDisposition, "filterOutcome">): boolean {
  return disposition.filterOutcome === "off_limits";
}
