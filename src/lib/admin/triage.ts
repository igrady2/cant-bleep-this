import "server-only";

import { databaseRows, type MessagesDatabase } from "@/lib/messages/db";
import { CATEGORIES, type CategoryId } from "@/lib/moderation/categories";
import { serializeTestCase } from "@/lib/presentation";
import {
  isTriageTag,
  TRIAGE_TAGS,
  type TriageGroup,
  type TriageItem,
  type TriageKind,
  type TriageScore,
  type TriageTag,
  type TriageView,
} from "./triage-types";

export * from "./triage-types";

/** Newest cases per kind; enough to skim, bounded for the Worker. */
export const TRIAGE_LIMIT = 500;

interface CaseRow {
  id: string;
  message: string;
  context_snapshot: string;
  rule: string | null;
  reasons: string;
  filter_scores: string | null;
  filter_version: string | null;
  version_added: string;
  tags: string | null;
}

const UNKNOWN_RULE = "unknown";
const ruleLabel = (rule: string) =>
  rule === "off_limits" ? "Off-limits" : CATEGORIES.find((category) => category.id === rule)?.label ?? rule;
const isCategory = (rule: string): rule is CategoryId => CATEGORIES.some((category) => category.id === rule);

function parseScores(raw: string | null): TriageScore[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  return Object.entries(parsed as Record<string, unknown>)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))
    .map(([rule, score]) => ({ rule, label: ruleLabel(rule), score }))
    .sort((a, b) => b.score - a.score || a.rule.localeCompare(b.rule));
}

/**
 * Slips group by the rule the deciding reviewers chose. False positives have no
 * reviewer rule (they were judged Fine), so they group by the reviewable rule
 * the filter scored highest: the one that blocked them.
 */
function groupRule(kind: TriageKind, row: CaseRow, scores: readonly TriageScore[]): string {
  if (kind === "slip") return row.rule && isCategory(row.rule) ? row.rule : UNKNOWN_RULE;
  return scores.find((score) => isCategory(score.rule))?.rule ?? UNKNOWN_RULE;
}

function safeJsonArray(raw: string | null): unknown[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

/**
 * Reads anonymized permanent test cases only, never live messages, and
 * re-masks them at this boundary like any other dataset export.
 */
function present(kind: TriageKind, row: CaseRow, scores: TriageScore[]): TriageItem {
  const context = safeJsonArray(row.context_snapshot).filter(
    (entry): entry is { username: string; text: string } =>
      !!entry && typeof (entry as { username?: unknown }).username === "string"
        && typeof (entry as { text?: unknown }).text === "string",
  );
  const masked = serializeTestCase({
    username: "",
    text: row.message,
    filterOutcome: kind === "slip" ? "passed" : "blocked",
    status: kind,
    // Capture already dropped undeliverable predecessors; snapshots keep none.
    context: context.map((entry) => ({ ...entry, filterOutcome: "passed", status: "clean" })),
    reasons: safeJsonArray(row.reasons).filter((reason): reason is string => typeof reason === "string"),
  });
  const tags = safeJsonArray(row.tags).filter(isTriageTag);
  return {
    id: row.id,
    message: masked.text,
    context: masked.context.map((entry) => ({ username: entry.username, text: entry.text })),
    reasons: [...masked.reasons],
    scores,
    filterVersion: row.filter_version,
    versionAdded: row.version_added,
    tags: TRIAGE_TAGS.filter((tag) => tags.includes(tag)),
  };
}

export async function loadTriage(db: MessagesDatabase, kind: TriageKind): Promise<TriageView> {
  const countRows = databaseRows(await db.prepare(`
    SELECT source_status, COUNT(*) AS n FROM test_cases
    WHERE source = 'game' AND source_status IN ('slip', 'false_positive')
    GROUP BY source_status
  `).bind().all!<{ source_status: TriageKind; n: number }>());
  const counts: Record<TriageKind, number> = { slip: 0, false_positive: 0 };
  for (const row of countRows) counts[row.source_status] = row.n;

  const rows = databaseRows(await db.prepare(`
    SELECT tc.id, tc.message, tc.context_snapshot, tc.rule, tc.reasons, tc.filter_scores,
      tc.filter_version, tc.version_added,
      (SELECT json_group_array(tag) FROM triage_tags WHERE test_case_id = tc.id) AS tags
    FROM test_cases tc
    WHERE tc.source = 'game' AND tc.source_status = ?
    ORDER BY tc.rowid DESC
    LIMIT ?
  `).bind(kind, TRIAGE_LIMIT).all!<CaseRow>());

  const groups = new Map<string, TriageGroup>();
  for (const row of rows) {
    const scores = parseScores(row.filter_scores);
    const rule = groupRule(kind, row, scores);
    let group = groups.get(rule);
    if (!group) {
      group = { rule, label: rule === UNKNOWN_RULE ? "No rule recorded" : ruleLabel(rule), items: [] };
      groups.set(rule, group);
    }
    group.items.push(present(kind, row, scores));
  }

  // Rules in policy order; unattributed cases last.
  const order = (rule: string) => {
    const index = CATEGORIES.findIndex((category) => category.id === rule);
    return index === -1 ? CATEGORIES.length : index;
  };
  return { kind, counts, groups: [...groups.values()].sort((a, b) => order(a.rule) - order(b.rule)) };
}

export type SetTagsResult = { ok: true; tags: TriageTag[] } | { ok: false; status: 400 | 404; error: string };

/** Replaces a triage item's tags. Only slips and false positives can be tagged. */
export async function setTriageTags(
  db: MessagesDatabase,
  testCaseId: unknown,
  tags: unknown,
  now = Math.floor(Date.now() / 1000),
): Promise<SetTagsResult> {
  if (typeof testCaseId !== "string" || testCaseId === "" || testCaseId.length > 100) {
    return { ok: false, status: 400, error: "testCaseId is required." };
  }
  if (!Array.isArray(tags) || tags.length > TRIAGE_TAGS.length || !tags.every(isTriageTag)) {
    return { ok: false, status: 400, error: `tags must be a list drawn from: ${TRIAGE_TAGS.join(", ")}.` };
  }
  const unique = TRIAGE_TAGS.filter((tag) => tags.includes(tag));

  const target = await db.prepare(`
    SELECT 1 AS found FROM test_cases
    WHERE id = ? AND source = 'game' AND source_status IN ('slip', 'false_positive') LIMIT 1
  `).bind(testCaseId).first!<{ found: number }>();
  if (!target) return { ok: false, status: 404, error: "No slip or false positive has that id." };

  await db.batch([
    db.prepare("DELETE FROM triage_tags WHERE test_case_id = ?").bind(testCaseId),
    ...unique.map((tag) => db.prepare(`
      INSERT INTO triage_tags (test_case_id, tag, created_at) VALUES (?, ?, ?)
    `).bind(testCaseId, tag, now)),
  ]);
  return { ok: true, tags: unique };
}
