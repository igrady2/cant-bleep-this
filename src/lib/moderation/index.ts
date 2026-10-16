import "server-only";

import { CATEGORIES, type CategoryId } from "./categories";
import { normalizeRoomContext, type ModerationContextLine } from "./context";
import { activeFilterVersion, normalizeMessage, type FilterConfig } from "./filter-versions";
import { thresholdOverride } from "./thresholds";
import { TypeSafeError, scoreWithJev } from "./typesafe";
import type { FilterOutcome, ModerationResult } from "./types";

export type { ModerationContextLine, ModerationRoomContext } from "./context";
export { MAX_CONTEXT_LINES, normalizeRoomContext, parseModerationRoomContext } from "./context";

export const DEFAULT_MODEL = "jev-latest";

function apiKey(): string {
  const key = process.env.TYPESAFE_API_KEY?.trim();
  if (!key) {
    throw new TypeSafeError("TYPESAFE_API_KEY is not configured");
  }
  return key;
}

export interface ModerateOptions {
  /** Preceding chat lines, oldest first (up to 10). */
  context?: readonly ModerationContextLine[];
  roomUsernames?: readonly string[];
  /** Filter version to apply. Defaults to the active version. */
  filter?: FilterConfig;
}

export interface JevScores {
  model: string;
  scores: Record<CategoryId, number>;
  offLimitsScore: number;
}

/** One Jev request with the version's questions and normalization. */
export async function scoreMessage(
  message: string,
  options: ModerateOptions = {},
): Promise<JevScores> {
  const filter = options.filter ?? activeFilterVersion();
  const roomContext = normalizeRoomContext(options.context ?? [], options.roomUsernames ?? []);
  return scoreWithJev(
    normalizeMessage(message, filter.normalization),
    apiKey(),
    process.env.TYPESAFE_MODEL || DEFAULT_MODEL,
    roomContext,
    filter.questions,
  );
}

/** Applies a version's thresholds to Jev scores. Pure, so stored scores can be re-judged. */
export function decideModeration(
  { model, scores, offLimitsScore }: JevScores,
  thresholds: FilterConfig["thresholds"],
): ModerationResult {
  let outcome: FilterOutcome = "passed";

  const reviewableFlags = CATEGORIES.filter((c) => scores[c.id] >= thresholds.rules[c.id])
    .map((c) => ({
      category: c.id,
      label: c.label,
      probability: scores[c.id],
      explanation: c.explanation,
    }))
    .sort((a, b) => b.probability - a.probability);

  if (offLimitsScore >= thresholds.offLimits) {
    outcome = "off_limits";
  } else if (reviewableFlags.length > 0) {
    outcome = "blocked";
  }

  const flags = outcome === "blocked" ? reviewableFlags : [];

  return {
    outcome,
    allowed: outcome === "passed",
    provider: "typesafe",
    model,
    threshold: Math.min(...CATEGORIES.map((c) => thresholds.rules[c.id])),
    offLimitsThreshold: thresholds.offLimits,
    flags,
    scores,
    offLimitsScore,
  };
}

/**
 * The version's thresholds with the operator overrides MODERATION_THRESHOLD
 * (all nine rules) and MODERATION_THRESHOLD_OFF_LIMITS applied. Overrides are
 * an emergency knob; a lasting threshold change belongs in a new version.
 */
export function liveThresholds(filter: FilterConfig): FilterConfig["thresholds"] {
  const rule = thresholdOverride("MODERATION_THRESHOLD");
  return {
    rules: rule === undefined
      ? filter.thresholds.rules
      : (Object.fromEntries(CATEGORIES.map((c) => [c.id, rule])) as Record<CategoryId, number>),
    offLimits: thresholdOverride("MODERATION_THRESHOLD_OFF_LIMITS") ?? filter.thresholds.offLimits,
  };
}

export async function moderate(
  message: string,
  options: ModerateOptions = {},
): Promise<ModerationResult> {
  const filter = options.filter ?? activeFilterVersion();
  const scored = await scoreMessage(message, { ...options, filter });
  return decideModeration(scored, liveThresholds(filter));
}

export { OFF_LIMITS_ID } from "./off-limits";
