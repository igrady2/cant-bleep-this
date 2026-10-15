import "server-only";

import { mayEnterReviewQueue, type MessageStatus } from "@/lib/messages/disposition";
import type { FilterOutcome } from "@/lib/moderation/types";
import type { AuthenticatedPlayer } from "@/lib/players/auth";
import type { ReviewsDatabase } from "./db";
import type { ReviewAssignResult } from "./types";

export async function validateMessageEligibility(
  db: ReviewsDatabase,
  messageId: string,
  player: AuthenticatedPlayer,
): Promise<ReviewAssignResult | { ok: true }> {
  const row = await (
    db
      .prepare(
        `SELECT m.author_id, m.filter_outcome, m.status
         FROM messages m
         WHERE m.id = ?
         LIMIT 1`,
      )
      .bind(messageId) as {
      first<T>(): Promise<T | null>;
    }
  ).first<{ author_id: string; filter_outcome: FilterOutcome; status: MessageStatus }>();

  if (!row) {
    return { ok: false, status: 404, error: "That message is not available to judge." };
  }
  if (row.author_id === player.id) {
    return { ok: false, status: 403, error: "You cannot judge your own messages." };
  }
  if (!mayEnterReviewQueue(row.filter_outcome, row.status)) {
    return { ok: false, status: 404, error: "That message is not available to judge." };
  }

  const existing = await (
    db
      .prepare(
        `SELECT 1 AS found FROM reviews
         WHERE message_id = ? AND player_id = ?
         LIMIT 1`,
      )
      .bind(messageId, player.id) as { first<T>(): Promise<T | null> }
  ).first<{ found: number }>();

  if (existing) {
    return { ok: false, status: 409, error: "You already reviewed that message." };
  }

  return { ok: true };
}
