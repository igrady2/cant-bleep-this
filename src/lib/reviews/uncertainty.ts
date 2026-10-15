import "server-only";

import { CATEGORIES } from "@/lib/moderation/categories";
import type { FilterScores } from "@/lib/moderation/types";
import { thresholdForCategory } from "@/lib/moderation/thresholds";

/** Smallest gap between any reviewable rule score and that rule's current threshold. */
export function smallestRuleThresholdGap(scores: FilterScores): number {
  let smallest = Number.POSITIVE_INFINITY;
  for (const category of CATEGORIES) {
    const score = scores[category.id] ?? 0;
    const threshold = thresholdForCategory(category.id);
    const gap = Math.abs(score - threshold);
    if (gap < smallest) smallest = gap;
  }
  return smallest;
}
