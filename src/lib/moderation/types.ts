import type { CategoryId } from "./categories";
import type { OFF_LIMITS_ID } from "./off-limits";

export type ModerationProvider = "typesafe";

export type FilterOutcome = "passed" | "blocked" | "off_limits";

export type FilterScoreKey = CategoryId | typeof OFF_LIMITS_ID;

export type FilterScores = Record<FilterScoreKey, number>;

export interface CategoryFlag {
  category: CategoryId;
  label: string;
  /** Probability (0–1) that the message falls in this category. */
  probability: number;
  explanation: string;
}

export interface ModerationResult {
  /** Passed messages may post; blocked messages are reviewable; off-limits messages are excluded. */
  outcome: FilterOutcome;
  allowed: boolean;
  provider: ModerationProvider;
  model: string;
  threshold: number;
  offLimitsThreshold: number;
  /** Reviewable categories at or above the threshold, highest probability first. Empty when off-limits. */
  flags: CategoryFlag[];
  scores: Record<CategoryId, number>;
  offLimitsScore: number;
}

/** Text returned by the server is safe for message presentation. */
export interface ModerationResponse extends ModerationResult {
  /** Omitted when the message is off-limits so the body never leaves the server. */
  message?: string;
}
