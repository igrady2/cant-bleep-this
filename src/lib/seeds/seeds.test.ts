import { describe, expect, it } from "vitest";

import seedFile from "../../../fixtures/seeds.json";
import { CATEGORIES } from "@/lib/moderation/categories";
import {
  SEED_MESSAGE_MAX_LENGTH,
  validateSeedFixtureFile,
} from "./validate";
import type { SeedFixture, SeedFixtureFile } from "./types";

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

  it("keeps message bodies within the PRD posting limit", () => {
    for (const fixture of data.fixtures) {
      expect(fixture.text.length).toBeLessThanOrEqual(SEED_MESSAGE_MAX_LENGTH);
      for (const line of fixture.context) {
        expect(line.text.length).toBeLessThanOrEqual(SEED_MESSAGE_MAX_LENGTH);
      }
    }
  });
});

describe("validateSeedFixtureFile negative cases", () => {
  const valid = data.fixtures[0];

  function fileWith(fixtures: SeedFixture[]): SeedFixtureFile {
    return { policyVersion: "v1", fixtures };
  }

  it("reports duplicate ids and verdict/rule mismatches without throwing", () => {
    const broken = fileWith([
      { ...valid, id: "seed-dup" },
      { ...valid, id: "seed-dup", expectedVerdict: "fine", rule: "profanity", reasons: ["x"] },
    ]);
    const errors = validateSeedFixtureFile(broken, { minFixtures: 1, maxFixtures: 10 });
    expect(errors.some((e) => e.includes("duplicate id"))).toBe(true);
    expect(errors.some((e) => e.includes("rule must be null"))).toBe(true);
  });

  it("handles malformed arrays and missing strings without throwing", () => {
    const broken = {
      policyVersion: "v1",
      fixtures: [
        {
          id: "seed-bad-01",
          author: "Player A",
          text: "ok",
          context: null,
          roomUsernames: "Player A",
          expectedVerdict: "not_ok",
          rule: "spam",
          reasons: null,
        },
      ],
    } as unknown as SeedFixtureFile;
    const errors = validateSeedFixtureFile(broken, { minFixtures: 1, maxFixtures: 10 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("context must be an array"))).toBe(true);
    expect(errors.some((e) => e.includes("roomUsernames must be a non-empty array"))).toBe(true);
    expect(errors.some((e) => e.includes("reasons must be an array"))).toBe(true);
  });

  it("flags overlong message text", () => {
    const longText = "x".repeat(SEED_MESSAGE_MAX_LENGTH + 1);
    const broken = fileWith([{ ...valid, id: "seed-long-01", text: longText }]);
    const errors = validateSeedFixtureFile(broken, { minFixtures: 1, maxFixtures: 10 });
    expect(errors.some((e) => e.includes("exceeds 140"))).toBe(true);
  });

  it("flags unmasked email in fixture text", () => {
    const broken = fileWith([
      {
        ...valid,
        id: "seed-pii-01",
        text: "reach me at user@example.test today",
      },
    ]);
    const errors = validateSeedFixtureFile(broken, { minFixtures: 1, maxFixtures: 10 });
    expect(errors.some((e) => e.includes("unmasked personal information"))).toBe(true);
  });
});
