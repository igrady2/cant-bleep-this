import { afterEach, describe, expect, it, vi } from "vitest";

import { CATEGORIES, type CategoryId } from "./categories";
import {
  ACTIVE_FILTER_VERSION_ID,
  FILTER_VERSIONS,
  activeFilterVersion,
  filterFingerprint,
  filterVersion,
  normalizeMessage,
  questionInstructions,
  scoringFingerprint,
  type FilterConfig,
} from "./filter-versions";
import { decideModeration, liveThresholds, moderate } from "./index";
import { OFF_LIMITS_ID, OFF_LIMITS_QUESTION } from "./off-limits";

const IDS = CATEGORIES.map((c) => c.id);

/** Released versions are frozen: editing one in place changes what its stamped messages meant. */
const RELEASED_FINGERPRINTS: Record<string, string> = {
  v1: "f21ece17a970206eed4c83bdbd6b02974feaca5a87713d3a437ac34775c8272d",
};

function stubJev(scores: Partial<Record<CategoryId, number>> = {}, offLimits = 0.02) {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => {
    const answers = Object.fromEntries(IDS.map((id) => [id, { type: "noul", noul: scores[id] ?? 0.02 }]));
    answers[OFF_LIMITS_ID] = { type: "noul", noul: offLimits };
    return new Response(JSON.stringify({ model: "jev-test", answers }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("TYPESAFE_API_KEY", "test-key");
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof stubJev>) {
  return JSON.parse(fetchMock.mock.calls[0][1]!.body as string) as {
    state: { message: string };
    questions: Record<string, { instructions: string }>;
  };
}

const v1 = filterVersion("v1");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("filter versions", () => {
  it("registers unique ids and an active version", () => {
    const ids = FILTER_VERSIONS.map((version) => version.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(activeFilterVersion().id).toBe(ACTIVE_FILTER_VERSION_ID);
    expect(() => filterVersion("v999")).toThrow(/Unknown filter version/);
  });

  it("keeps released versions unchanged", async () => {
    for (const [id, fingerprint] of Object.entries(RELEASED_FINGERPRINTS)) {
      expect(await filterFingerprint(filterVersion(id))).toBe(fingerprint);
    }
  });

  it("defines v1 as the policy v1 questions at 0.5 with no normalization", () => {
    for (const category of CATEGORIES) {
      expect(v1.questions[category.id]).toEqual({ ...category.question, examples: [] });
      expect(v1.thresholds.rules[category.id]).toBe(0.5);
    }
    expect(v1.questions[OFF_LIMITS_ID]).toEqual({ ...OFF_LIMITS_QUESTION, examples: [] });
    expect(v1.thresholds.offLimits).toBe(0.5);
    expect(v1.normalization).toEqual([]);
  });

  it("appends examples to a question's instructions", () => {
    const question = { ...v1.questions.profanity, examples: [{ message: "what the fudge", applies: false }] };
    expect(questionInstructions(v1.questions.profanity)).toBe(v1.questions.profanity.instructions);
    expect(questionInstructions(question)).toBe(
      `${question.instructions}\n\nExamples:\n- "what the fudge": no`,
    );
  });

  it("normalizes spelling tricks only when a version asks for it", () => {
    expect(normalizeMessage("F U C K this", [])).toBe("F U C K this");
    expect(normalizeMessage("F U C K this", ["collapse_spaced_letters", "lowercase"])).toBe("fuck this");
    expect(normalizeMessage("s.h.i.t happens", ["collapse_spaced_letters"])).toBe("shit happens");
    expect(normalizeMessage("I am a cat", ["collapse_spaced_letters"])).toBe("I am a cat");
    expect(normalizeMessage("sh1t, call 555 1234 @ 5pm", ["fold_leetspeak"])).toBe("shit, call 555 1234 @ spm");
  });

  it("shares a scoring fingerprint only when questions and normalization match", async () => {
    const thresholdOnly: FilterConfig = {
      ...v1, id: "t", thresholds: { ...v1.thresholds, offLimits: 0.6 },
    };
    const normalized: FilterConfig = { ...v1, id: "n", normalization: ["lowercase"] };
    expect(await scoringFingerprint(thresholdOnly)).toBe(await scoringFingerprint(v1));
    expect(await scoringFingerprint(normalized)).not.toBe(await scoringFingerprint(v1));
    expect(await filterFingerprint(thresholdOnly)).not.toBe(await filterFingerprint(v1));
  });
});

describe("moderate with a filter version", () => {
  it("sends the version's questions and normalized message to Jev", async () => {
    const fetchMock = stubJev();
    const candidate: FilterConfig = {
      ...v1,
      id: "candidate",
      questions: {
        ...v1.questions,
        profanity: { ...v1.questions.profanity, examples: [{ message: "sh1t", applies: true }] },
      },
      normalization: ["fold_leetspeak"],
    };
    await moderate("sh1t", { filter: candidate });
    const body = sentBody(fetchMock);
    expect(body.state.message).toBe("shit");
    expect(body.questions.profanity.instructions).toContain('"sh1t": yes');
    expect(Object.keys(body.questions)).toEqual([...IDS, OFF_LIMITS_ID]);
  });

  it("sends v1 wording unchanged by default", async () => {
    const fetchMock = stubJev();
    await moderate("hello");
    const body = sentBody(fetchMock);
    expect(body.state.message).toBe("hello");
    for (const category of CATEGORIES) {
      expect(body.questions[category.id].instructions).toBe(category.question.instructions);
    }
  });

  it("applies per-rule thresholds", () => {
    const scores = Object.fromEntries(IDS.map((id) => [id, 0.02])) as Record<CategoryId, number>;
    scores.profanity = 0.35;
    const scored = { model: "jev-test", scores, offLimitsScore: 0.02 };
    expect(decideModeration(scored, v1.thresholds).outcome).toBe("passed");
    const stricter = { ...v1.thresholds, rules: { ...v1.thresholds.rules, profanity: 0.3 } };
    const result = decideModeration(scored, stricter);
    expect(result.outcome).toBe("blocked");
    expect(result.flags.map((flag) => flag.category)).toEqual(["profanity"]);
    expect(result.threshold).toBe(0.3);
  });

  it("lets operator overrides replace a version's thresholds on the live path", () => {
    expect(liveThresholds(v1)).toEqual(v1.thresholds);
    vi.stubEnv("MODERATION_THRESHOLD", "0.7");
    vi.stubEnv("MODERATION_THRESHOLD_OFF_LIMITS", "0.8");
    const live = liveThresholds(v1);
    expect(new Set(Object.values(live.rules))).toEqual(new Set([0.7]));
    expect(live.offLimits).toBe(0.8);
  });
});
