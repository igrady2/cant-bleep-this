import "server-only";

import { databaseRows } from "@/lib/messages/db";
import { CATEGORIES } from "@/lib/moderation/categories";
import type { MessagesDatabase } from "@/lib/messages/db";
import type { FlaggedSpan } from "./spans";

export interface SlipCensorship {
  slipRule: string;
  slipSpans: FlaggedSpan[];
}

export interface DecidingNotOkVote {
  message_id: string;
  rule: string | null;
  reason: string | null;
  flagged_spans: string;
}

/** Mirror consensus eligibility and ordering, including the hand-picked cap.
 * Limit to the first three eligible votes, then the first two Not OK votes.
 */
export async function loadDecidingNotOkVotes(
  db: MessagesDatabase,
  messageIds: readonly string[],
): Promise<DecidingNotOkVote[]> {
  if (!messageIds.length) return [];
  const rows = await db.prepare(`
    WITH eligible AS (
      SELECT r.message_id, r.verdict, r.rule, r.reason, r.flagged_spans, r.assignment,
        r.created_at, r.rowid AS sequence,
        SUM(CASE WHEN r.assignment = 'hand_picked' THEN 1 ELSE 0 END)
          OVER (PARTITION BY r.message_id ORDER BY r.created_at, r.rowid) AS hand_picked_count
      FROM reviews r
      JOIN messages m ON m.id = r.message_id
      JOIN players p ON p.id = r.player_id
      WHERE r.message_id IN (${messageIds.map(() => "?").join(", ")})
        AND r.player_id <> m.author_id AND p.reviewer_standing = 'good'
        AND r.seed_case_id IS NULL
        AND r.skipped = 0 AND r.verdict IN ('fine', 'not_ok')
    ), votes AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY message_id ORDER BY created_at, sequence) AS vote_number
      FROM eligible WHERE assignment = 'queue' OR hand_picked_count = 1
    ), deciding AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY message_id ORDER BY created_at, sequence) AS agreement_number
      FROM votes WHERE vote_number <= 3 AND verdict = 'not_ok'
    )
    SELECT message_id, rule, reason, flagged_spans FROM deciding WHERE agreement_number <= 2
    ORDER BY message_id, created_at, sequence
  `).bind(...messageIds).all!<DecidingNotOkVote>();
  return databaseRows(rows);
}

export async function loadSlipCensorship(
  db: MessagesDatabase,
  messageIds: readonly string[],
): Promise<Map<string, SlipCensorship>> {
  const result = new Map<string, SlipCensorship>();
  for (const row of await loadDecidingNotOkVotes(db, messageIds)) {
    let censorship = result.get(row.message_id);
    if (!censorship) {
      censorship = {
        slipRule: CATEGORIES.find((category) => category.id === row.rule)?.label ?? row.rule ?? "Slip",
        slipSpans: [],
      };
      result.set(row.message_id, censorship);
    }
    censorship.slipSpans.push(...JSON.parse(row.flagged_spans));
  }
  return result;
}
