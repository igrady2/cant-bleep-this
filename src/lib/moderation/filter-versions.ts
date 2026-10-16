import "server-only";

import { CATEGORIES, type CategoryId } from "./categories";
import { OFF_LIMITS_ID, OFF_LIMITS_QUESTION } from "./off-limits";
import type { FilterScoreKey } from "./types";

/** A worked example shown to Jev with a question; `applies` is the expected answer. */
export interface FilterExample {
  message: string;
  applies: boolean;
}

export interface FilterQuestion {
  instructions: string;
  criteria: { true: string; false: string };
  /** Appended to the instructions. Empty keeps the instructions exactly as written. */
  examples: readonly FilterExample[];
}

/**
 * Text steps applied to the message (not its context) before Jev scores it.
 * Stored and displayed text is never normalized.
 */
export type NormalizationStep =
  /** Lowercase the message. */
  | "lowercase"
  /** Join runs of single letters split by spaces, dots or dashes: "f u c k" becomes "fuck". */
  | "collapse_spaced_letters"
  /** Fold common leetspeak digits and symbols inside words to letters: "sh1t" becomes "shit". */
  | "fold_leetspeak";

/**
 * One filter version: everything that turns a message into an outcome apart
 * from the Jev model. A released id is stamped on every message it judges, so
 * never edit a released configuration in place; add the next version instead.
 */
export interface FilterConfig {
  /** Stable id stamped on messages: "v1", "v2", and so on. */
  id: string;
  questions: Record<FilterScoreKey, FilterQuestion>;
  thresholds: {
    /** Inclusive per-rule blocking thresholds. */
    rules: Record<CategoryId, number>;
    /** Inclusive threshold for the separate off-limits exclusion question. */
    offLimits: number;
  };
  normalization: readonly NormalizationStep[];
}

/** Policy v1 wording from docs/CONTENT_RULES.md, every threshold at 0.5. */
const V1: FilterConfig = {
  id: "v1",
  questions: {
    ...(Object.fromEntries(
      CATEGORIES.map((c): [CategoryId, FilterQuestion] => [c.id, { ...c.question, examples: [] }]),
    ) as Record<CategoryId, FilterQuestion>),
    [OFF_LIMITS_ID]: { ...OFF_LIMITS_QUESTION, examples: [] },
  },
  thresholds: {
    rules: Object.fromEntries(CATEGORIES.map((c) => [c.id, 0.5])) as Record<CategoryId, number>,
    offLimits: 0.5,
  },
  normalization: [],
};

/**
 * Every filter version, released or candidate. A candidate is registered here
 * and evaluated with `npm run evaluate:filter`; it ships only when it passes the
 * release gate and `ACTIVE_FILTER_VERSION_ID` points at it.
 */
export const FILTER_VERSIONS: readonly FilterConfig[] = [V1];

/** The version the posting path uses and stamps on each new message. */
export const ACTIVE_FILTER_VERSION_ID = "v1";

export function findFilterVersion(id: string): FilterConfig | undefined {
  return FILTER_VERSIONS.find((version) => version.id === id);
}

export function filterVersion(id: string): FilterConfig {
  const version = findFilterVersion(id);
  if (!version) throw new Error(`Unknown filter version "${id}"`);
  return version;
}

export function activeFilterVersion(): FilterConfig {
  return filterVersion(ACTIVE_FILTER_VERSION_ID);
}

/** Instructions as sent to Jev, with any examples appended. */
export function questionInstructions(question: FilterQuestion): string {
  if (question.examples.length === 0) return question.instructions;
  const lines = question.examples.map(
    (example) => `- ${JSON.stringify(example.message)}: ${example.applies ? "yes" : "no"}`,
  );
  return `${question.instructions}\n\nExamples:\n${lines.join("\n")}`;
}

const LEET: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s",
};

const STEPS: Record<NormalizationStep, (text: string) => string> = {
  lowercase: (text) => text.toLowerCase(),
  collapse_spaced_letters: (text) =>
    text.replace(/\b[A-Za-z](?:[ .\-][A-Za-z]\b){2,}/g, (run) => run.replace(/[ .\-]/g, "")),
  // Only inside words that also contain a letter, so plain numbers survive.
  fold_leetspeak: (text) =>
    text.replace(/[A-Za-z0-9@$]+/g, (word) =>
      /[A-Za-z]/.test(word) ? word.replace(/[013457@$]/g, (ch) => LEET[ch]) : word,
    ),
};

export function normalizeMessage(text: string, steps: readonly NormalizationStep[]): string {
  return steps.reduce((current, step) => STEPS[step](current), text);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 of a value's key-sorted JSON, for reproducibility checks in reports. */
export function contentHash(value: unknown): Promise<string> {
  return sha256(canonicalJson(value));
}

/** Content hash of a whole configuration; it changes with any wording, example, threshold or step. */
export function filterFingerprint(config: FilterConfig): Promise<string> {
  return contentHash(config);
}

/**
 * Hash of the parts that decide Jev's scores (questions and normalization).
 * Two versions with the same scoring fingerprint differ only in thresholds,
 * so one Jev call per case serves both.
 */
export function scoringFingerprint(config: FilterConfig): Promise<string> {
  return contentHash({ questions: config.questions, normalization: config.normalization });
}
