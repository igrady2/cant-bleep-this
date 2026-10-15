import { describe, expect, it } from "vitest";

import { parseDailyCapCheckError } from "./daily-caps";

describe("parseDailyCapCheckError", () => {
  it("maps the player cap CHECK expression to player_cap", () => {
    const result = parseDailyCapCheckError(
      new Error("CHECK constraint failed: post_count >= 0 AND post_count <= 20"),
    );
    expect(result).toEqual({
      ok: false,
      status: 429,
      error: "You have reached today's posting limit. Try again tomorrow.",
      code: "player_cap",
    });
  });

  it("maps the site cap CHECK expression to site_cap", () => {
    const result = parseDailyCapCheckError(
      new Error("CHECK constraint failed: post_count >= 0 AND post_count <= 2000"),
    );
    expect(result).toEqual({
      ok: false,
      status: 429,
      error: "The room has reached today's posting limit. Try again tomorrow.",
      code: "site_cap",
    });
  });

  it("returns null for unrelated constraint failures", () => {
    expect(parseDailyCapCheckError(new Error("CHECK constraint failed: claim_count <= 3"))).toBe(
      null,
    );
  });
});
