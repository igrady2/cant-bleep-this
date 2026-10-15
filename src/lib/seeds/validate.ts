import { CATEGORIES, type CategoryId } from "@/lib/moderation/categories";

import type { SeedFixture, SeedFixtureFile } from "./types";

const RULE_IDS = new Set<CategoryId>(CATEGORIES.map((c) => c.id));

const ID_PATTERN = /^seed-[a-z0-9_-]+$/;

const EMAIL_PATTERN =
  /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/i;

function collectText(fixture: SeedFixture): string[] {
  return [
    fixture.author,
    fixture.text,
    ...fixture.context.flatMap((line) => [line.username, line.text]),
    ...fixture.roomUsernames,
    ...fixture.reasons,
  ];
}

function longestDigitRun(text: string): number {
  let longest = 0;
  let current = 0;
  for (const char of text) {
    if (/\d/.test(char)) {
      current += 1;
      longest = Math.max(longest, current);
    } else if (!/[.()-]/.test(char) && char !== " ") {
      current = 0;
    }
  }
  return longest;
}

function hasUnmaskedPersonalInfo(text: string): boolean {
  if (EMAIL_PATTERN.test(text)) return true;
  return longestDigitRun(text) >= 7;
}

export interface SeedValidationOptions {
  minFixtures?: number;
  maxFixtures?: number;
}

export function validateSeedFixtureFile(
  data: SeedFixtureFile,
  options: SeedValidationOptions = {},
): string[] {
  const minFixtures = options.minFixtures ?? 95;
  const maxFixtures = options.maxFixtures ?? 105;
  const errors: string[] = [];

  if (data.policyVersion !== "v1") {
    errors.push(`policyVersion must be "v1", got ${JSON.stringify(data.policyVersion)}`);
  }

  if (!Array.isArray(data.fixtures)) {
    errors.push("fixtures must be an array");
    return errors;
  }

  const { length } = data.fixtures;
  if (length < minFixtures || length > maxFixtures) {
    errors.push(`expected between ${minFixtures} and ${maxFixtures} fixtures, got ${length}`);
  }

  const seenIds = new Set<string>();
  const rulesCovered = new Set<CategoryId>();

  for (const fixture of data.fixtures) {
    const prefix = fixture.id ? `fixture ${fixture.id}` : "fixture (missing id)";

    if (!fixture.id || !ID_PATTERN.test(fixture.id)) {
      errors.push(`${prefix}: id must match ${ID_PATTERN}`);
    } else if (seenIds.has(fixture.id)) {
      errors.push(`${prefix}: duplicate id`);
    } else {
      seenIds.add(fixture.id);
    }

    if (!fixture.author?.trim()) {
      errors.push(`${prefix}: author is required`);
    }

    if (!fixture.text?.trim()) {
      errors.push(`${prefix}: text is required`);
    }

    if (!Array.isArray(fixture.context) || fixture.context.length > 10) {
      errors.push(`${prefix}: context must be an array with at most 10 lines`);
    } else {
      for (const [index, line] of fixture.context.entries()) {
        if (!line.username?.trim() || !line.text?.trim()) {
          errors.push(`${prefix}: context[${index}] needs username and text`);
        }
      }
    }

    if (!Array.isArray(fixture.roomUsernames) || fixture.roomUsernames.length === 0) {
      errors.push(`${prefix}: roomUsernames must be a non-empty array`);
    } else if (!fixture.roomUsernames.includes(fixture.author)) {
      errors.push(`${prefix}: roomUsernames must include author`);
    }

    if (fixture.expectedVerdict !== "fine" && fixture.expectedVerdict !== "not_ok") {
      errors.push(`${prefix}: expectedVerdict must be "fine" or "not_ok"`);
    }

    if (fixture.expectedVerdict === "fine") {
      if (fixture.rule !== null) {
        errors.push(`${prefix}: rule must be null when expectedVerdict is fine`);
      }
    } else if (fixture.rule === null || !RULE_IDS.has(fixture.rule)) {
      errors.push(`${prefix}: rule must be a game category id when expectedVerdict is not_ok`);
    } else {
      rulesCovered.add(fixture.rule);
    }

    if (!Array.isArray(fixture.reasons)) {
      errors.push(`${prefix}: reasons must be an array`);
    } else if (fixture.expectedVerdict === "not_ok" && fixture.reasons.length === 0) {
      errors.push(`${prefix}: not_ok fixtures need at least one reason`);
    } else if (fixture.expectedVerdict === "fine" && fixture.reasons.length > 0) {
      errors.push(`${prefix}: fine fixtures must not include reasons`);
    }

    for (const text of collectText(fixture)) {
      if (hasUnmaskedPersonalInfo(text)) {
        errors.push(`${prefix}: unmasked personal information in fixture text`);
        break;
      }
    }
  }

  for (const id of RULE_IDS) {
    if (!rulesCovered.has(id)) {
      errors.push(`no not_ok fixture covers rule ${id}`);
    }
  }

  return errors;
}

export function assertValidSeedFixtureFile(
  data: SeedFixtureFile,
  options?: SeedValidationOptions,
): void {
  const errors = validateSeedFixtureFile(data, options);
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
}
