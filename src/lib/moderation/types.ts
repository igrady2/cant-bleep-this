import type { CategoryId } from "./categories";

export type ModerationProvider = "typesafe" | "mock";

export interface CategoryFlag {
  category: CategoryId;
  label: string;
  /** Probability (0–1) that the message falls in this category. */
  probability: number;
  explanation: string;
}

export interface ModerationResult {
  allowed: boolean;
  provider: ModerationProvider;
  model: string;
  threshold: number;
  /** Categories at or above the threshold, highest probability first. */
  flags: CategoryFlag[];
  scores: Record<CategoryId, number>;
}

/** Text returned by the server is safe for message presentation. */
export interface ModerationResponse extends ModerationResult {
  message: string;
}
