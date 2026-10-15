import "server-only";

import { CATEGORIES } from "./categories";
import { normalizeRoomContext, type ModerationContextLine } from "./context";
import { offLimitsThreshold, reviewableThreshold } from "./thresholds";
import { TypeSafeError, scoreWithJev } from "./typesafe";
import type { FilterOutcome, ModerationResult } from "./types";

export type { ModerationContextLine, ModerationRoomContext } from "./context";
export { MAX_CONTEXT_LINES, normalizeRoomContext, parseModerationRoomContext } from "./context";

const DEFAULT_MODEL = "jev-latest";

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
}

export async function moderate(
  message: string,
  options: ModerateOptions = {},
): Promise<ModerationResult> {
  const limit = reviewableThreshold();
  const offLimit = offLimitsThreshold();
  const roomContext = normalizeRoomContext(options.context ?? [], options.roomUsernames ?? []);

  const { model, scores, offLimitsScore } = await scoreWithJev(
    message,
    apiKey(),
    process.env.TYPESAFE_MODEL || DEFAULT_MODEL,
    roomContext,
  );

  let outcome: FilterOutcome = "passed";

  const reviewableFlags = CATEGORIES.filter((c) => scores[c.id] >= limit)
    .map((c) => ({
      category: c.id,
      label: c.label,
      probability: scores[c.id],
      explanation: c.explanation,
    }))
    .sort((a, b) => b.probability - a.probability);

  if (offLimitsScore >= offLimit) {
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
    threshold: limit,
    offLimitsThreshold: offLimit,
    flags,
    scores,
    offLimitsScore,
  };
}

export { OFF_LIMITS_ID } from "./off-limits";
