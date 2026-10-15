import { afterEach, describe, expect, it, vi } from "vitest";

import { SELF_HARM_CRISIS_NOTE } from "@/lib/content/self-harm-crisis-note";
import { CATEGORIES } from "@/lib/moderation/categories";
import type { ModerationResult } from "@/lib/moderation/types";
import { buildModerationApiBody } from "./moderation-response";

afterEach(() => {
  vi.unstubAllEnvs();
});

const scores = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0.03])) as ModerationResult["scores"];

const base: ModerationResult = {
  outcome: "passed",
  allowed: true,
  provider: "typesafe",
  model: "jev-test",
  threshold: 0.5,
  offLimitsThreshold: 0.5,
  flags: [],
  scores,
  offLimitsScore: 0.03,
};

describe("buildModerationApiBody", () => {
  it("returns only outcome, allowed, and provider for off-limits results", () => {
    const body = buildModerationApiBody(
      { ...base, outcome: "off_limits", allowed: false, offLimitsScore: 0.95 },
      "secret threat text",
    );
    expect(body).toEqual({ outcome: "off_limits", allowed: false, provider: "typesafe" });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(JSON.stringify(body)).not.toContain("scores");
    expect(JSON.stringify(body)).not.toContain("threshold");
  });

  it("includes disposition fields for reviewable outcomes", () => {
    const body = buildModerationApiBody(base, "hello");
    expect(body).toMatchObject({
      outcome: "passed",
      allowed: true,
      filterOutcome: "passed",
      status: "pending",
      message: "hello",
    });
    expect(body).not.toHaveProperty("crisisNote");
  });

  it("adds the 988 crisis note when self_harm meets its threshold", () => {
    const body = buildModerationApiBody(
      {
        ...base,
        scores: { ...scores, self_harm: 0.72 },
      },
      "masked synthetic example",
    );
    expect(body).toMatchObject({ crisisNote: SELF_HARM_CRISIS_NOTE });
  });

  it("omits the crisis note when self_harm is below threshold", () => {
    const body = buildModerationApiBody(
      {
        ...base,
        outcome: "blocked",
        allowed: false,
        flags: [
          {
            category: "profanity",
            label: "Profanity",
            probability: 0.8,
            explanation: "Synthetic test flag.",
          },
        ],
        scores: { ...scores, profanity: 0.8, self_harm: 0.1 },
      },
      "masked synthetic example",
    );
    expect(body).not.toHaveProperty("crisisNote");
  });

  it("includes the crisis note on blocked messages when self_harm scores high", () => {
    const body = buildModerationApiBody(
      {
        ...base,
        outcome: "blocked",
        allowed: false,
        flags: [
          {
            category: "self_harm",
            label: "Self-harm encouragement",
            probability: 0.81,
            explanation: "Synthetic test flag.",
          },
        ],
        scores: { ...scores, self_harm: 0.81 },
      },
      "masked synthetic example",
    );
    expect(body).toMatchObject({ crisisNote: SELF_HARM_CRISIS_NOTE, allowed: false });
  });

  it("can attach the crisis note to off-limits responses without leaking message text", () => {
    const body = buildModerationApiBody(
      {
        ...base,
        outcome: "off_limits",
        allowed: false,
        offLimitsScore: 0.95,
        scores: { ...scores, self_harm: 0.9 },
      },
      "secret off-limits text",
    );
    expect(body).toEqual({
      outcome: "off_limits",
      allowed: false,
      provider: "typesafe",
      crisisNote: SELF_HARM_CRISIS_NOTE,
    });
  });

  it("shows the crisis note on passed checks when self_harm meets only the crisis threshold", () => {
    vi.stubEnv("MODERATION_THRESHOLD_SELF_HARM", "0.35");
    const body = buildModerationApiBody(
      { ...base, scores: { ...scores, self_harm: 0.4 } },
      "hello",
    );
    expect(body).toMatchObject({
      crisisNote: SELF_HARM_CRISIS_NOTE,
      allowed: true,
      filterOutcome: "passed",
    });
  });

  it("respects MODERATION_THRESHOLD_SELF_HARM for the crisis note", () => {
    vi.stubEnv("MODERATION_THRESHOLD_SELF_HARM", "0.8");
    const below = buildModerationApiBody(
      { ...base, scores: { ...scores, self_harm: 0.79 } },
      "hello",
    );
    expect(below).not.toHaveProperty("crisisNote");
    const above = buildModerationApiBody(
      { ...base, scores: { ...scores, self_harm: 0.8 } },
      "hello",
    );
    expect(above).toMatchObject({ crisisNote: SELF_HARM_CRISIS_NOTE });
  });
});
