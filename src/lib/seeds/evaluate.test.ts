import { afterEach, describe, expect, it, vi } from "vitest";

import { CATEGORIES, type CategoryId } from "@/lib/moderation/categories";
import { OFF_LIMITS_ID } from "@/lib/moderation/off-limits";
import type { ModerationResult } from "@/lib/moderation/types";
import { SEED_FIXTURES } from "@/lib/seeds";
import type { SeedFixture } from "@/lib/seeds/types";
import { TypeSafeError } from "@/lib/moderation/typesafe";
import {
  classifySeedEvalCase,
  evaluateSeedFixtures,
  sanitizeSeedEvalError,
  serializeSeedEvalReport,
} from "@/lib/seeds/evaluate";
import { parseEvaluateSeedsArgs } from "../../../scripts/evaluate-seeds";
const IDS = CATEGORIES.map((c) => c.id);

function moderationResult(
  outcome: ModerationResult["outcome"],
  flagged: CategoryId[] = [],
  offLimitsScore = 0.02,
): ModerationResult {
  const scores = Object.fromEntries(IDS.map((id) => [id, 0.02])) as Record<CategoryId, number>;
  for (const id of flagged) scores[id] = 0.9;
  const flags = flagged.map((category) => ({
    category,
    label: category,
    probability: 0.9,
    explanation: "test",
  }));
  return {
    outcome,
    allowed: outcome === "passed",
    provider: "typesafe",
    model: "jev-test",
    threshold: 0.5,
    offLimitsThreshold: 0.5,
    flags: outcome === "blocked" ? flags : [],
    scores,
    offLimitsScore,
  };
}

function jevResponse(scores: Partial<Record<CategoryId, number>>, offLimits = 0.02) {
  const answers = Object.fromEntries(IDS.map((id) => [id, { type: "noul", noul: scores[id] ?? 0.02 }]));
  answers[OFF_LIMITS_ID] = { type: "noul", noul: offLimits };
  return new Response(JSON.stringify({ model: "jev-test", answers }), { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sanitizeSeedEvalError", () => {
  it("maps provider failures to redacted markers without leaking response text", () => {
    const leaky = new TypeSafeError('TypeSafe responded 502: {"secret":"do-not-store"}', 502);
    expect(sanitizeSeedEvalError(leaky)).toBe("jev_server_error");
    expect(sanitizeSeedEvalError(leaky)).not.toContain("secret");
    expect(sanitizeSeedEvalError(new TypeSafeError("x", 429))).toBe("jev_rate_limited");
    expect(sanitizeSeedEvalError(new Error("raw message"))).toBe("moderation_error");
  });
});

describe("parseEvaluateSeedsArgs", () => {
  it("requires --live to be passed explicitly", () => {
    expect(parseEvaluateSeedsArgs(["node", "script.ts"])).toEqual({
      output: "reports/seed-baseline.json",
      live: false,
    });
    expect(parseEvaluateSeedsArgs(["node", "script.ts", "--live"]).live).toBe(true);
  });
});

describe("classifySeedEvalCase", () => {
  const base: SeedFixture = {
    id: "seed-test",
    author: "Player A",
    text: "hello",
    context: [],
    roomUsernames: ["Player A"],
    expectedVerdict: "fine",
    rule: null,
    reasons: [],
  };

  it("labels clean passes and false positives", () => {
    expect(classifySeedEvalCase(base, moderationResult("passed"))).toBe("pass");
    expect(classifySeedEvalCase(base, moderationResult("blocked", ["profanity"]))).toBe(
      "false_positive",
    );
  });

  it("labels catches, misses, and wrong-rule blocks", () => {
    const notOk: SeedFixture = {
      ...base,
      expectedVerdict: "not_ok",
      rule: "sexual_content",
      reasons: ["innuendo"],
    };
    expect(classifySeedEvalCase(notOk, moderationResult("passed"))).toBe("miss");
    expect(classifySeedEvalCase(notOk, moderationResult("blocked", ["sexual_content"]))).toBe(
      "catch",
    );
    expect(classifySeedEvalCase(notOk, moderationResult("blocked", ["profanity"]))).toBe(
      "wrong_rule",
    );
  });
});

describe("evaluateSeedFixtures", () => {
  it("aggregates per-rule stats and contextual failures without message text", async () => {
    const fixtures: SeedFixture[] = [
      {
        id: "seed-fine-01",
        author: "Player A",
        text: "fine message",
        context: [{ username: "Player B", text: "prior line" }],
        roomUsernames: ["Player A", "Player B"],
        expectedVerdict: "fine",
        rule: null,
        reasons: [],
      },
      {
        id: "seed-profanity-01",
        author: "Player A",
        text: "bad word",
        context: [],
        roomUsernames: ["Player A"],
        expectedVerdict: "not_ok",
        rule: "profanity",
        reasons: ["swear"],
      },
    ];

    const report = await evaluateSeedFixtures(fixtures, async (fixture) => {
      if (fixture.id === "seed-fine-01") {
        return moderationResult("blocked", ["profanity"]);
      }
      return moderationResult("blocked", ["profanity"]);
    });

    expect(report.fixtureCount).toBe(2);
    expect(report.summary.falsePositive).toBe(1);
    expect(report.summary.catch).toBe(1);
    expect(report.summary.contextualFailures).toBe(1);
    expect(report.byRule.profanity.catches).toBe(1);
    expect(report.byRule.profanity.falsePositiveFlags).toBe(1);
    const serialized = serializeSeedEvalReport(report);
    expect(serialized).not.toContain("fine message");
    expect(serialized).not.toContain("bad word");
    expect(serialized).toContain("seed-fine-01");
  });

  it("stores redacted error markers on moderation failures", async () => {
    const fixtures: SeedFixture[] = [
      {
        id: "seed-err-01",
        author: "Player A",
        text: "x",
        context: [],
        roomUsernames: ["Player A"],
        expectedVerdict: "fine",
        rule: null,
        reasons: [],
      },
    ];
    const report = await evaluateSeedFixtures(fixtures, async () => {
      throw new TypeSafeError('TypeSafe responded 400: {"detail":"leak"}', 400);
    });
    expect(report.summary.errors).toBe(1);
    expect(report.cases[0]?.error).toBe("jev_client_error");
    const serialized = serializeSeedEvalReport(report);
    expect(serialized).not.toContain("leak");
    expect(serialized).not.toContain("detail");
  });

  it("runs every checked-in seed through moderate with mocked Jev (one request per fixture)", async () => {
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => jevResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");

    const report = await evaluateSeedFixtures(SEED_FIXTURES);
    expect(fetchMock).toHaveBeenCalledTimes(SEED_FIXTURES.length);
    expect(report.fixtureCount).toBe(SEED_FIXTURES.length);
    expect(report.summary.errors).toBe(0);
    expect(report.configuration.typesafeModelResolved).toBe("jev-test");

    const contextual = SEED_FIXTURES.find((f) => f.context.length > 0);
    expect(contextual).toBeDefined();
    const callForContextual = fetchMock.mock.calls.find(([, init]) => {
      const body = JSON.parse(String(init?.body)) as { state: { message: string } };
      return body.state.message === contextual!.text;
    });
    expect(callForContextual).toBeDefined();
    const body = JSON.parse(String(callForContextual![1]?.body)) as {
      state: { message: string; context: unknown[]; roomUsernames: string[] };
    };
    expect(body.state.context).toEqual(contextual!.context);
    expect(body.state.roomUsernames).toEqual(contextual!.roomUsernames);
  });
});
