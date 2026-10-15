import { describe, expect, it } from "vitest";

import seedFile from "../../../fixtures/seeds.json";
import { CATEGORIES } from "@/lib/moderation/categories";
import { validateSeedFixtureFile } from "./validate";
import type { SeedFixtureFile } from "./types";

const data = seedFile as SeedFixtureFile;

describe("seed fixtures", () => {
  it("validates the checked-in fixture file", () => {
    expect(validateSeedFixtureFile(data)).toEqual([]);
  });

  it("covers every reviewable rule with at least one not_ok example", () => {
    const covered = new Set(
      data.fixtures.filter((f) => f.expectedVerdict === "not_ok").map((f) => f.rule),
    );
    for (const { id } of CATEGORIES) {
      expect(covered.has(id)).toBe(true);
    }
  });

  it("includes fine examples and contextual ambiguities", () => {
    const fineCount = data.fixtures.filter((f) => f.expectedVerdict === "fine").length;
    expect(fineCount).toBeGreaterThanOrEqual(20);
    const contextual = data.fixtures.filter((f) => f.context.length > 0);
    expect(contextual.length).toBeGreaterThanOrEqual(40);
    const disguisedProfanity = data.fixtures.filter(
      (f) => f.rule === "profanity" && /[1*]/.test(f.text),
    );
    expect(disguisedProfanity.length).toBeGreaterThanOrEqual(3);
  });
});
