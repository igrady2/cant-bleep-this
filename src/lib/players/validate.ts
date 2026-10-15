import "server-only";

import { scoreUsernameWithJev } from "./jev";
import {
  isBlockedWordUsername,
  isReservedUsername,
  isValidUsernameFormat,
  normalizeUsername,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from "./policy";

const DEFAULT_MODEL = "jev-latest";
export const USERNAME_JEV_THRESHOLD = 0.5;

export type UsernameRejectionCode =
  | "invalid_format"
  | "reserved"
  | "blocked_word"
  | "offensive"
  | "provider_unavailable";

export type UsernameValidationResult =
  | {
      ok: true;
      name: string;
      normalizedName: string;
      jevScore: number;
      jevModel: string;
      threshold: number;
    }
  | { ok: false; code: UsernameRejectionCode; error: string };

export type UsernameLocalValidationFailure = Extract<UsernameValidationResult, { ok: false }>;

export function validateUsernameLocally(name: string): UsernameLocalValidationFailure | null {
  const trimmed = name.trim();
  if (!isValidUsernameFormat(trimmed)) {
    return {
      ok: false,
      code: "invalid_format",
      error: `Usernames must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} letters, numbers, or underscores.`,
    };
  }
  if (isReservedUsername(trimmed)) {
    return { ok: false, code: "reserved", error: "That username is reserved. Pick another one." };
  }
  if (isBlockedWordUsername(trimmed)) {
    return { ok: false, code: "blocked_word", error: "That username is not allowed. Pick another one." };
  }
  return null;
}

/** Server-side name policy for claims (#8). Local checks, then Jev; fails closed on errors. */
export async function validateUsernameForClaim(name: string): Promise<UsernameValidationResult> {
  const local = validateUsernameLocally(name);
  if (local) return local;

  const trimmed = name.trim();
  const apiKey = process.env.TYPESAFE_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      code: "provider_unavailable",
      error: "Name checks are unavailable right now. Please try again.",
    };
  }

  try {
    const { model, score } = await scoreUsernameWithJev(
      trimmed,
      apiKey,
      process.env.TYPESAFE_MODEL?.trim() || DEFAULT_MODEL,
    );
    if (score >= USERNAME_JEV_THRESHOLD) {
      return { ok: false, code: "offensive", error: "That username is not allowed. Pick another one." };
    }
    return {
      ok: true,
      name: trimmed,
      normalizedName: normalizeUsername(trimmed),
      jevScore: score,
      jevModel: model,
      threshold: USERNAME_JEV_THRESHOLD,
    };
  } catch (err) {
    console.error("[players]", err);
    return {
      ok: false,
      code: "provider_unavailable",
      error: "Name checks are unavailable right now. Please try again.",
    };
  }
}
