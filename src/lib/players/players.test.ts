import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isBlockedWordUsername,
  isReservedUsername,
  isValidUsernameFormat,
  normalizeUsername,
  USERNAME_MAX_LENGTH,
} from "./policy";
import { USERNAME_JEV_QUESTION } from "./jev";
import { validateUsernameForClaim, validateUsernameLocally } from "./validate";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("username policy", () => {
  it.each([
    ["paul", "pau1"],
    ["billy", "bil1y"],
    ["Indigo", "lndigo"],
    ["Indigo", "1ndig0"],
    ["modern", "modem"],
    ["s0und", "sound"],
  ])("lookalike %s matches %s", (left, right) => {
    expect(normalizeUsername(left)).toBe(normalizeUsername(right));
  });

  it.each([
    ["indigo2", true],
    ["theadmin", true],
    ["official_jev", true],
    ["modern_player", false],
    ["mod_tools", true],
  ])("reserved %s -> %s", (name, reserved) => {
    expect(isReservedUsername(name)).toBe(reserved);
  });

  it.each([
    "classic_fan",
    "assist",
    "pass",
    "bass_player",
    "title",
    "document",
    "button",
    "raccoon",
    "sussex",
    "assassin",
    "classic",
  ])("word list allows innocent name %s", (name) => {
    expect(isBlockedWordUsername(name)).toBe(false);
  });

  it("word list blocks whole names and segments only", () => {
    expect(isBlockedWordUsername("5h1t")).toBe(true);
    expect(isBlockedWordUsername("ass")).toBe(true);
    expect(isBlockedWordUsername("cool_ass")).toBe(true);
    expect(isValidUsernameFormat("a".repeat(USERNAME_MAX_LENGTH))).toBe(true);
    expect(isValidUsernameFormat("a".repeat(USERNAME_MAX_LENGTH + 1))).toBe(false);
    expect(isValidUsernameFormat("аlex")).toBe(false);
    expect(isValidUsernameFormat("Ａlex")).toBe(false);
    expect(validateUsernameLocally("  good_name  ")).toBeNull();
    expect(validateUsernameLocally("  ab  ")).toMatchObject({ code: "invalid_format" });
  });
});

describe("validateUsernameForClaim", () => {
  function stubJev(score: number) {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          model: "jev-test",
          answers: { username_offensive: { type: "noul", noul: score } },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
    return fetchMock;
  }

  it("fails closed without a key, on bad Jev, and after 429 retries", async () => {
    expect(await validateUsernameForClaim("puzzle_fan")).toMatchObject({
      ok: false,
      code: "provider_unavailable",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ model: "jev-test", answers: {} }), { status: 200 }),
      ),
    );
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
    expect(await validateUsernameForClaim("puzzle_fan")).toMatchObject({
      ok: false,
      code: "provider_unavailable",
    });
    const fetch429 = vi.fn(async () => new Response("slow down", { status: 429 }));
    vi.stubGlobal("fetch", fetch429);
    expect(await validateUsernameForClaim("puzzle_fan")).toMatchObject({
      ok: false,
      code: "provider_unavailable",
    });
    expect(fetch429).toHaveBeenCalledTimes(3);
  });

  function sentBody(fetchMock: ReturnType<typeof vi.fn>) {
    const init = fetchMock.mock.calls[0]?.[1];
    if (!init || typeof init !== "object" || !("body" in init)) {
      throw new Error("expected fetch to be called with a request body");
    }
    return JSON.parse(String((init as RequestInit).body)) as {
      questions: Record<string, { instructions: string }>;
    };
  }

  it("uses PRD Jev wording at 0.5", async () => {
    const fetchMock = stubJev(0.49);
    const allowed = await validateUsernameForClaim("puzzle_fan");
    const body = sentBody(fetchMock);
    expect(body.questions.username_offensive.instructions).toBe(USERNAME_JEV_QUESTION.instructions);
    expect(allowed).toMatchObject({ ok: true, threshold: 0.5 });
    stubJev(0.5);
    expect(await validateUsernameForClaim("puzzle_fan")).toMatchObject({ ok: false, code: "offensive" });
  });
});
