import type { CategoryId } from "./categories";
import { CATEGORIES } from "./categories";

/** Player-facing choices from the nine reviewable categories; off_limits is a separate check. */
export const REVIEW_RULE_OPTIONS: ReadonlyArray<{ id: CategoryId; label: string }> =
  CATEGORIES.map((c) => ({ id: c.id, label: c.label }));
