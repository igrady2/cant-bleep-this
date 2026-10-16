import "server-only";

import { databaseRows } from "@/lib/messages/db";
import { loadSlipCensorship } from "./censorship";
import { mayAppearInContext } from "@/lib/messages/disposition";
import type { FilterOutcome } from "@/lib/moderation/types";
import type { MessageStatus } from "@/lib/messages/disposition";
import type { MessagePresentation } from "@/lib/presentation";
import type { ReviewsDatabase } from "./db";

interface MessageRow {
  id: string;
  author_id: string;
  author_name: string;
  text: string | null;
  masked_text: string | null;
  filter_outcome: FilterOutcome;
  status: MessageStatus;
  context_message_ids: string;
}

interface ContextRow {
  id: string;
  author_name: string;
  text: string | null;
  masked_text: string | null;
  filter_outcome: FilterOutcome;
  status: MessageStatus;
}

function reviewerBody(row: Pick<MessageRow, "text" | "masked_text" | "filter_outcome">): string {
  if (row.text == null) return "";
  return row.filter_outcome === "blocked" ? (row.masked_text ?? row.text) : row.text;
}

async function loadContextRows(
  db: ReviewsDatabase,
  contextIds: readonly string[],
): Promise<ContextRow[]> {
  if (contextIds.length === 0) return [];

  const placeholders = contextIds.map(() => "?").join(", ");
  const rows = await (
    db
      .prepare(
        `SELECT m.id, p.name AS author_name, m.text, m.masked_text, m.filter_outcome, m.status
         FROM messages m
         INNER JOIN players p ON p.id = m.author_id
         WHERE m.id IN (${placeholders})`,
      )
      .bind(...contextIds) as { all<T>(): Promise<T[]> }
  ).all<ContextRow>();

  const byId = new Map(databaseRows(rows).map((row) => [row.id, row]));
  return contextIds
    .map((id) => byId.get(id))
    .filter((row): row is ContextRow => row !== undefined)
    .filter((row) => mayAppearInContext(row.filter_outcome, row.status));
}

export async function loadMessageReviewPresentation(
  db: ReviewsDatabase,
  messageId: string,
): Promise<MessagePresentation | null> {
  const row = await (
    db
      .prepare(
        `SELECT m.id, m.author_id, p.name AS author_name, m.text, m.masked_text,
                m.filter_outcome, m.status, m.context_message_ids
         FROM messages m
         INNER JOIN players p ON p.id = m.author_id
         WHERE m.id = ?
         LIMIT 1`,
      )
      .bind(messageId) as { first<T>(): Promise<T | null> }
  ).first<MessageRow>();

  if (!row || row.text == null) return null;
  if (!mayAppearInContext(row.filter_outcome, row.status)) return null;

  const contextIds = JSON.parse(row.context_message_ids) as string[];
  const contextRows = await loadContextRows(db, contextIds);

  const slips = await loadSlipCensorship(db, contextRows.filter((entry) => entry.status === "slip").map((entry) => entry.id));

  return {
    username: row.author_name,
    text: reviewerBody(row),
    filterOutcome: row.filter_outcome,
    status: row.status,
    reasons: [],
    context: contextRows.map((entry) => ({
      sourceMessageId: entry.id,
      ...(entry.status === "slip" ? (slips.get(entry.id) ?? { slipRule: "Slip", slipSpans: [] }) : {}),
      username: entry.author_name,
      text: reviewerBody(entry),
      filterOutcome: entry.filter_outcome,
      status: entry.status,
    })),
  };
}

export async function loadSeedReviewPresentation(
  db: ReviewsDatabase,
  seedCaseId: string,
): Promise<MessagePresentation | null> {
  const row = await (
    db
      .prepare(
        `SELECT id, message, context_snapshot
         FROM test_cases
         WHERE id = ? AND source = 'seed'
         LIMIT 1`,
      )
      .bind(seedCaseId) as {
      first<T>(): Promise<T | null>;
    }
  ).first<{ id: string; message: string; context_snapshot: string }>();

  if (!row) return null;

  const context = JSON.parse(row.context_snapshot) as Array<{ username: string; text: string }>;

  // Rotate the pool per seed while preserving every reference to the same player.
  const names = [
    "sam_skates", "mira_cloud", "alex_draws", "kai_music", "riley_reads",
    "taylor_runs", "jordan_codes", "casey_cooks", "avery_bikes", "quinn_paints",
    "rowan_hikes", "sage_plays", "emery_sings", "finley_swims", "parker_bakes",
    "reese_gardens", "blair_dances", "devon_climbs", "ellis_writes", "hayden_knits",
    "jamie_builds", "logan_fishes", "morgan_skis", "noel_drums", "robin_sews",
    "skyler_surfs", "drew_travels", "jules_walks",
  ];
  const offset = Array.from(seedCaseId).reduce(
    (hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0,
  ) % names.length;
  const existingNames = new Set(context.map((line) => line.username));
  const pool = names.slice(offset).concat(names.slice(0, offset))
    .filter((name) => !existingNames.has(name));
  const replacements = new Map<string, string>();
  const replacePlayers = (text: string) => text.replace(/\bPlayer [A-Z]\b/g, (player) => {
    if (!replacements.has(player)) replacements.set(player, pool[replacements.size]);
    return replacements.get(player)!;
  });
  const presentedContext = context.map((line) => ({
    username: replacePlayers(line.username),
    text: replacePlayers(line.text),
    filterOutcome: "passed" as const,
    status: "pending" as const,
  }));
  const text = replacePlayers(row.message);

  return {
    username: pool[replacements.size],
    text,
    filterOutcome: "passed",
    status: "pending",
    reasons: [],
    context: presentedContext,
  };
}
