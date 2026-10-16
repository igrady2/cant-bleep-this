import "server-only";

import type { CategoryId } from "./categories";
import { CATEGORIES } from "./categories";

const DEFAULT_THRESHOLD = 0.5;

/** A valid operator override from the environment, if one is set. */
export function thresholdOverride(envName: string): number | undefined {
  const parsed = Number(process.env[envName]);
  return Number.isFinite(parsed) && parsed > 0 && parsed < 1 ? parsed : undefined;
}

function readThreshold(envName: string): number {
  return thresholdOverride(envName) ?? DEFAULT_THRESHOLD;
}

/** Probability at or above which a reviewable rule blocks a message. */
export function reviewableThreshold(): number {
  return readThreshold("MODERATION_THRESHOLD");
}

/** Independent threshold for the off-limits exclusion question. */
export function offLimitsThreshold(): number {
  return readThreshold("MODERATION_THRESHOLD_OFF_LIMITS");
}

/** Threshold for the `self_harm` rule and the author-only 988 crisis note. */
export function selfHarmThreshold(): number {
  return readThreshold("MODERATION_THRESHOLD_SELF_HARM");
}

let cachedRuleThresholds: Record<CategoryId, number> | null = null;

function parseRuleThresholdOverrides(): Partial<Record<CategoryId, number>> {
  const raw = process.env.MODERATION_RULE_THRESHOLDS?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const overrides: Partial<Record<CategoryId, number>> = {};
    for (const category of CATEGORIES) {
      const value = parsed[category.id];
      if (typeof value === "number" && value > 0 && value < 1) {
        overrides[category.id] = value;
      }
    }
    return overrides;
  } catch {
    return {};
  }
}

/** Current blocking threshold for one reviewable rule (configurable per rule). */
export function thresholdForCategory(categoryId: CategoryId): number {
  if (!cachedRuleThresholds) {
    const overrides = parseRuleThresholdOverrides();
    const fallback = reviewableThreshold();
    cachedRuleThresholds = Object.fromEntries(
      CATEGORIES.map((category) => [category.id, overrides[category.id] ?? fallback]),
    ) as Record<CategoryId, number>;
  }
  return cachedRuleThresholds[categoryId];
}

/** Reset cached thresholds (tests). */
export function resetThresholdCache(): void {
  cachedRuleThresholds = null;
}
