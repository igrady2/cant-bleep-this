import type { CategoryId } from "@/lib/moderation/categories";

/** One preceding chat line in a seed fixture (masked, synthetic). */
export interface SeedContextLine {
  username: string;
  text: string;
}

export type SeedExpectedVerdict = "fine" | "not_ok";

/**
 * A labeled seed message for filter evaluation and reviewer known-answer checks.
 * Shape aligns with D1 `test_cases` plus author and room usernames for Jev context.
 */
export interface SeedFixture {
  id: string;
  author: string;
  text: string;
  context: SeedContextLine[];
  roomUsernames: string[];
  expectedVerdict: SeedExpectedVerdict;
  /** Required when `expectedVerdict` is `not_ok`; null when `fine`. */
  rule: CategoryId | null;
  reasons: string[];
}

export interface SeedFixtureFile {
  policyVersion: string;
  fixtures: SeedFixture[];
}
