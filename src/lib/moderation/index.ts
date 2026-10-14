import "server-only";

import { CATEGORIES } from "./categories";
import { scoreWithMock } from "./mock";
import { scoreWithJev } from "./typesafe";
import type { ModerationResult } from "./types";

const DEFAULT_MODEL = "jev-latest";
const DEFAULT_THRESHOLD = 0.5;

function threshold(): number {
  const parsed = Number(process.env.MODERATION_THRESHOLD);
  return Number.isFinite(parsed) && parsed > 0 && parsed < 1 ? parsed : DEFAULT_THRESHOLD;
}

export function activeProvider(): "typesafe" | "mock" {
  if (process.env.MODERATION_PROVIDER === "mock") return "mock";
  return process.env.TYPESAFE_API_KEY ? "typesafe" : "mock";
}

export async function moderate(message: string): Promise<ModerationResult> {
  const provider = activeProvider();
  const limit = threshold();

  const { model, scores } =
    provider === "typesafe"
      ? await scoreWithJev(
          message,
          process.env.TYPESAFE_API_KEY!,
          process.env.TYPESAFE_MODEL || DEFAULT_MODEL,
        )
      : { model: "local-mock", scores: scoreWithMock(message) };

  // Policy: any single category at or above the threshold blocks the message.
  const flags = CATEGORIES.filter((c) => scores[c.id] >= limit)
    .map((c) => ({
      category: c.id,
      label: c.label,
      probability: scores[c.id],
      explanation: c.explanation,
    }))
    .sort((a, b) => b.probability - a.probability);

  return { allowed: flags.length === 0, provider, model, threshold: limit, flags, scores };
}
