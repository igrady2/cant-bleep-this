import "server-only";

import { loadPatchedVersions } from "@/lib/filter-release/releases";
import { databaseRows } from "@/lib/messages/db";
import { loadSlipCensorship, type SlipCensorship } from "@/lib/reviews/censorship";
import { filterMessagesForFeed } from "./delivery";
import type { MessageStatus } from "./disposition";
import type { MessagesDatabase } from "./db";
import { FEED_MESSAGE_LIMIT } from "./room-config";
import { serializePublicMessage } from "@/lib/presentation";

interface FeedRow {
  id: string;
  masked_text: string;
  status: MessageStatus;
  created_at: number;
  filter_outcome: "passed";
  author_name: string;
}

/** Player-visible feed item after masking and public slip presentation. */
export interface PublicFeedMessage {
  id: string;
  author: string;
  text: string;
  createdAt: number;
  status: MessageStatus;
  slipRule?: string;
  /** Released filter version that now catches this slip (#26). Points still stand. */
  patchedIn?: string;
}

/** Allowed JSON keys on GET /api/feed items (author-only fields such as crisisNote are excluded). */
export const PUBLIC_FEED_MESSAGE_KEYS = [
  "id",
  "author",
  "text",
  "createdAt",
  "status",
  "slipRule",
  "patchedIn",
] as const satisfies readonly (keyof PublicFeedMessage)[];

function serializeFeedRow(
  row: FeedRow,
  slips: Map<string, SlipCensorship>,
  patched: Map<string, string>,
): PublicFeedMessage {
  const censorship = row.status === "slip" ? (slips.get(row.id) ?? { slipRule: "Slip", slipSpans: [] }) : {};
  const presented = serializePublicMessage({
    username: row.author_name,
    text: row.masked_text,
    ...censorship,
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
    ...(row.status === "slip" && patched.has(row.id) ? { patchedIn: patched.get(row.id) } : {}),
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
    databaseRows(rows).map((row) => ({
      row,
      filterOutcome: row.filter_outcome,
      status: row.status,
    })),
  ).map((entry) => entry.row);

  const slipIds = eligible.filter((row) => row.status === "slip").map((row) => row.id);
  const slipRules = await loadSlipCensorship(db, slipIds);
  const patched = await loadPatchedVersions(db, slipIds);

  const chronological = [...eligible].reverse();
  return chronological.map((row) => serializeFeedRow(row, slipRules, patched));
}
