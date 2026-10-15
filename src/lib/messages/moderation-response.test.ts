import { describe, expect, it } from "vitest";

import { CATEGORIES } from "@/lib/moderation/categories";
import type { ModerationResult } from "@/lib/moderation/types";
import { buildModerationApiBody } from "./moderation-response";

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
  });
});
