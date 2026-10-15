import { afterEach, describe, expect, it } from "vitest";

import { CATEGORIES } from "@/lib/moderation/categories";
import { resetThresholdCache, thresholdForCategory } from "@/lib/moderation/thresholds";
import type { FilterScores } from "@/lib/moderation/types";
import { smallestRuleThresholdGap } from "./uncertainty";

function scores(overrides: Partial<FilterScores> = {}): FilterScores {
  const base = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0.1])) as FilterScores;
  return { ...base, off_limits: 0.01, ...overrides };
}

afterEach(() => {
  delete process.env.MODERATION_THRESHOLD;
  delete process.env.MODERATION_RULE_THRESHOLDS;
  resetThresholdCache();
});

describe("smallestRuleThresholdGap", () => {
  it("uses the smallest abs(score - threshold) across reviewable rules", () => {
    process.env.MODERATION_THRESHOLD = "0.5";
    resetThresholdCache();

    expect(smallestRuleThresholdGap(scores({ profanity: 0.48 }))).toBeCloseTo(0.02, 5);
  });

  it("picks up per-rule threshold overrides immediately after cache reset", () => {
    process.env.MODERATION_THRESHOLD = "0.5";
    process.env.MODERATION_RULE_THRESHOLDS = JSON.stringify({ profanity: 0.4 });
    resetThresholdCache();

    expect(thresholdForCategory("profanity")).toBe(0.4);
    expect(smallestRuleThresholdGap(scores({ profanity: 0.45 }))).toBeCloseTo(0.05, 5);
  });
});
