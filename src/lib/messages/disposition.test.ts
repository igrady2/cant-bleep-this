import { describe, expect, it } from "vitest";

import type { ModerationResult } from "@/lib/moderation/types";
import {
  dispositionFromModeration,
  maintainerRemovalEntersTestSet,
  mayAppearInContext,
  mayAppearInFeed,
  mayEnterReviewQueue,
  mayEnterTestCase,
} from "./disposition";

const baseResult = (overrides: Partial<ModerationResult>): ModerationResult => ({
  outcome: "passed",
  allowed: true,
  provider: "mock",
  model: "local-mock",
  threshold: 0.5,
  offLimitsThreshold: 0.5,
  flags: [],
  scores: {
    bullying_harassment: 0.03,
    hate_speech: 0.03,
    sexual_content: 0.03,
    violence_threats: 0.03,
    self_harm: 0.03,
    profanity: 0.03,
    personal_info: 0.03,
    spam: 0.03,
    impersonation: 0.03,
  },
  offLimitsScore: 0.03,
  ...overrides,
});

describe("message disposition", () => {
  it("stores null text for off-limits outcomes", () => {
    const disposition = dispositionFromModeration(
      baseResult({ outcome: "off_limits", allowed: false, offLimitsScore: 0.9 }),
      "raw body",
      "masked body",
    );
    expect(disposition).toEqual({
      filterOutcome: "off_limits",
      status: "excluded",
      text: null,
      maskedText: null,
      filterScores: { ...baseResult({}).scores, off_limits: 0.9 },
    });
  });

  it("keeps masked text for reviewable blocked messages", () => {
    const disposition = dispositionFromModeration(
      baseResult({ outcome: "blocked", allowed: false, flags: [] }),
      "raw",
      "masked",
    );
    expect(disposition.filterOutcome).toBe("blocked");
    expect(disposition.status).toBe("pending");
    expect(disposition.text).toBe("raw");
    expect(disposition.maskedText).toBe("masked");
  });

  it("allows blocked messages in the review queue but not off-limits rows", () => {
    expect(mayEnterReviewQueue("blocked")).toBe(true);
    expect(mayEnterReviewQueue("passed")).toBe(true);
    expect(mayEnterReviewQueue("off_limits")).toBe(false);
  });

  it("keeps off-limits and excluded rows out of feed, context and test cases", () => {
    expect(mayAppearInFeed("off_limits", "excluded")).toBe(false);
    expect(mayAppearInFeed("passed", "excluded")).toBe(false);
    expect(mayAppearInFeed("passed", "pending")).toBe(true);
    expect(mayAppearInContext("off_limits", "excluded")).toBe(false);
    expect(mayAppearInContext("blocked", "pending")).toBe(true);
    expect(mayEnterTestCase("off_limits", "excluded")).toBe(false);
    expect(maintainerRemovalEntersTestSet()).toBe(false);
  });
});
