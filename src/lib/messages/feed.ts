import "server-only";

import { CATEGORIES } from "@/lib/moderation/categories";
import { filterMessagesForFeed } from "./delivery";
import type { MessageStatus } from "./disposition";
import type { MessagesDatabase } from "./db";
import { FEED_MESSAGE_LIMIT } from "./room-config";
import { maskPersonalInformation, serializePublicMessage } from "@/lib/presentation";

interface FeedRow {
  id: string;
  masked_text: string;
  status: MessageStatus;
  created_at: number;
  filter_outcome: "passed";
  author_name: string;
}

interface SlipRuleRow {
  message_id: string;
  rule: string | null;
}

/** Player-visible feed item after masking and public slip presentation. */
export interface PublicFeedMessage {
  id: string;
  author: string;
  text: string;
  createdAt: number;
  status: MessageStatus;
  slipRule?: string;
}

/** Allowed JSON keys on GET /api/feed items (author-only fields such as crisisNote are excluded). */
export const PUBLIC_FEED_MESSAGE_KEYS = [
  "id",
  "author",
  "text",
  "createdAt",
  "status",
  "slipRule",
] as const satisfies readonly (keyof PublicFeedMessage)[];

function slipRuleLabel(ruleId: string | null | undefined): string | undefined {
  if (!ruleId) return undefined;
  const category = CATEGORIES.find((entry) => entry.id === ruleId);
  const label = category?.label ?? ruleId;
  return maskPersonalInformation(label);
}

async function loadSlipRules(
  db: MessagesDatabase,
  messageIds: readonly string[],
): Promise<Map<string, string>> {
  if (messageIds.length === 0) return new Map();

  const placeholders = messageIds.map(() => "?").join(", ");
  const rows = await (
    db
      .prepare(
        `SELECT message_id, rule
         FROM reviews
         WHERE message_id IN (${placeholders})
           AND skipped = 0
           AND verdict = 'not_ok'
         ORDER BY created_at ASC, id ASC`,
      )
      .bind(...messageIds) as { all<T>(): Promise<T[]> }
  ).all<SlipRuleRow>();

  const rules = new Map<string, string>();
  for (const row of rows) {
    if (rules.has(row.message_id)) continue;
    const label = slipRuleLabel(row.rule);
    if (label) rules.set(row.message_id, label);
  }
  return rules;
}

function serializeFeedRow(row: FeedRow, slipRules: Map<string, string>): PublicFeedMessage {
  const slipRule = row.status === "slip" ? slipRules.get(row.id) : undefined;
  const presented = serializePublicMessage({
    username: row.author_name,
    text: row.masked_text,
    ...(slipRule === undefined ? {} : { slipRule }),
    filterOutcome: "passed",
    status: row.status,
    context: [],
    reasons: [],
  });

  return {
    id: row.id,
    author: presented.username,
    text: presented.text,
    createdAt: row.created_at,
    status: presented.status,
    ...(presented.slipRule === undefined ? {} : { slipRule: presented.slipRule }),
  };
}

/** Loads the shared room feed from D1 message rows only (never from post/moderate API bodies). */
export async function loadPublicFeed(
  db: MessagesDatabase,
  limit = FEED_MESSAGE_LIMIT,
): Promise<PublicFeedMessage[]> {
  const rows = await (
    db
      .prepare(
        `SELECT m.id, m.masked_text, m.status, m.created_at, m.filter_outcome, p.name AS author_name
         FROM messages m
         INNER JOIN players p ON p.id = m.author_id
         WHERE m.filter_outcome = 'passed' AND m.status <> 'excluded'
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT ?`,
      )
      .bind(limit) as { all<T>(): Promise<T[]> }
  ).all<FeedRow>();

  const eligible = filterMessagesForFeed(
    rows.map((row) => ({
      row,
      filterOutcome: row.filter_outcome,
      status: row.status,
    })),
  ).map((entry) => entry.row);

  const slipIds = eligible.filter((row) => row.status === "slip").map((row) => row.id);
  const slipRules = await loadSlipRules(db, slipIds);

  const chronological = [...eligible].reverse();
  return chronological.map((row) => serializeFeedRow(row, slipRules));
}
