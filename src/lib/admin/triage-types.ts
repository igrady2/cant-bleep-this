/** Shared by the admin API and the client triage board; no server imports. */

/** Trick tags from the PRD's "How slips improve the filter". */
export const TRIAGE_TAGS = ["spelling", "sound", "meaning", "context"] as const;
export type TriageTag = (typeof TRIAGE_TAGS)[number];

export const TRIAGE_KINDS = ["slip", "false_positive"] as const;
export type TriageKind = (typeof TRIAGE_KINDS)[number];

export interface TriageScore {
  rule: string;
  label: string;
  score: number;
}

export interface TriageItem {
  id: string;
  message: string;
  context: { username: string; text: string }[];
  reasons: string[];
  scores: TriageScore[];
  filterVersion: string | null;
  versionAdded: string;
  tags: TriageTag[];
}

export interface TriageGroup {
  /** Rule id, or "unknown" when no rule could be attributed. */
  rule: string;
  label: string;
  items: TriageItem[];
}

export interface TriageView {
  kind: TriageKind;
  counts: Record<TriageKind, number>;
  groups: TriageGroup[];
}

export function isTriageTag(value: unknown): value is TriageTag {
  return typeof value === "string" && (TRIAGE_TAGS as readonly string[]).includes(value);
}

export function isTriageKind(value: unknown): value is TriageKind {
  return typeof value === "string" && (TRIAGE_KINDS as readonly string[]).includes(value);
}
