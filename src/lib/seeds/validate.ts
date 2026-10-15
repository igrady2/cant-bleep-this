import { CATEGORIES, type CategoryId } from "@/lib/moderation/categories";

import type { SeedFixture, SeedFixtureFile } from "./types";

const RULE_IDS = new Set<CategoryId>(CATEGORIES.map((c) => c.id));

const ID_PATTERN = /^seed-[a-z0-9_-]+$/;

const EMAIL_PATTERN =
  /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/i;

/** PRD posting limit for message bodies in the game room. */
export const SEED_MESSAGE_MAX_LENGTH = 140;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function collectText(fixture: SeedFixture): string[] {
  const parts: string[] = [];
  if (isNonEmptyString(fixture.author)) parts.push(fixture.author);
  if (isNonEmptyString(fixture.text)) parts.push(fixture.text);
  if (Array.isArray(fixture.context)) {
    for (const line of fixture.context) {
      if (line && isNonEmptyString(line.username)) parts.push(line.username);
      if (line && isNonEmptyString(line.text)) parts.push(line.text);
    }
  }
  if (Array.isArray(fixture.roomUsernames)) {
    parts.push(...fixture.roomUsernames.filter(isNonEmptyString));
  }
  if (Array.isArray(fixture.reasons)) {
    parts.push(...fixture.reasons.filter(isNonEmptyString));
  }
  return parts;
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

function validateMessageLength(
  prefix: string,
  label: string,
  text: unknown,
  errors: string[],
): void {
  if (text === undefined || text === null) return;
  if (typeof text !== "string") {
    errors.push(`${prefix}: ${label} must be a string`);
    return;
  }
  if (text.length > SEED_MESSAGE_MAX_LENGTH) {
    errors.push(
      `${prefix}: ${label} exceeds ${SEED_MESSAGE_MAX_LENGTH} characters (${text.length})`,
    );
  }
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
    const prefix = fixture?.id ? `fixture ${fixture.id}` : "fixture (missing id)";

    if (!isNonEmptyString(fixture?.id) || !ID_PATTERN.test(fixture.id)) {
      errors.push(`${prefix}: id must match ${ID_PATTERN}`);
    } else if (seenIds.has(fixture.id)) {
      errors.push(`${prefix}: duplicate id`);
    } else {
      seenIds.add(fixture.id);
    }

    if (!isNonEmptyString(fixture?.author)) {
      errors.push(`${prefix}: author is required`);
    }

    validateMessageLength(prefix, "text", fixture?.text, errors);
    if (!isNonEmptyString(fixture?.text)) {
      errors.push(`${prefix}: text is required`);
    }

    if (!Array.isArray(fixture?.context) || fixture.context.length > 10) {
      errors.push(`${prefix}: context must be an array with at most 10 lines`);
    } else {
      for (const [index, line] of fixture.context.entries()) {
        if (!line || typeof line !== "object") {
          errors.push(`${prefix}: context[${index}] must be an object`);
          continue;
        }
        if (!isNonEmptyString(line.username)) {
          errors.push(`${prefix}: context[${index}] needs username`);
        }
        validateMessageLength(prefix, `context[${index}].text`, line.text, errors);
        if (!isNonEmptyString(line.text)) {
          errors.push(`${prefix}: context[${index}] needs text`);
        }
      }
    }

    if (!Array.isArray(fixture?.roomUsernames) || fixture.roomUsernames.length === 0) {
      errors.push(`${prefix}: roomUsernames must be a non-empty array`);
    } else if (isNonEmptyString(fixture.author) && !fixture.roomUsernames.includes(fixture.author)) {
      errors.push(`${prefix}: roomUsernames must include author`);
    }

    if (fixture?.expectedVerdict !== "fine" && fixture?.expectedVerdict !== "not_ok") {
      errors.push(`${prefix}: expectedVerdict must be "fine" or "not_ok"`);
    }

    if (fixture?.expectedVerdict === "fine") {
      if (fixture.rule !== null) {
        errors.push(`${prefix}: rule must be null when expectedVerdict is fine`);
      }
    } else if (fixture?.expectedVerdict === "not_ok") {
      if (fixture.rule === null || !RULE_IDS.has(fixture.rule)) {
        errors.push(`${prefix}: rule must be a game category id when expectedVerdict is not_ok`);
      } else {
        rulesCovered.add(fixture.rule);
      }
    }

    if (!Array.isArray(fixture?.reasons)) {
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
