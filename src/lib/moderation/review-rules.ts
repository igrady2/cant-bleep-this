import type { CategoryId } from "./categories";
import { CATEGORIES } from "./categories";

/** Player-facing review rule choices (excludes off_limits). */
export const REVIEW_RULE_OPTIONS: ReadonlyArray<{ id: CategoryId; label: string }> =
  CATEGORIES.map((c) => ({ id: c.id, label: c.label }));
