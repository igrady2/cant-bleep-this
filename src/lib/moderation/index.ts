import "server-only";

import { CATEGORIES } from "./categories";
import { scoreWithMock } from "./mock";
import { offLimitsThreshold, reviewableThreshold } from "./thresholds";
import { scoreWithJev } from "./typesafe";
import type { FilterOutcome, ModerationResult } from "./types";

const DEFAULT_MODEL = "jev-latest";

export function activeProvider(): "typesafe" | "mock" {
  if (process.env.MODERATION_PROVIDER === "mock") return "mock";
  return process.env.TYPESAFE_API_KEY ? "typesafe" : "mock";
}

export async function moderate(message: string): Promise<ModerationResult> {
  const provider = activeProvider();
  const limit = reviewableThreshold();
  const offLimit = offLimitsThreshold();

  const { model, scores, offLimitsScore } =
    provider === "typesafe"
      ? await scoreWithJev(
          message,
          process.env.TYPESAFE_API_KEY!,
          process.env.TYPESAFE_MODEL || DEFAULT_MODEL,
        )
      : { model: "local-mock", ...scoreWithMock(message) };

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
    provider,
    model,
    threshold: limit,
    offLimitsThreshold: offLimit,
    flags,
    scores,
    offLimitsScore,
  };
}

export { OFF_LIMITS_ID } from "./off-limits";
