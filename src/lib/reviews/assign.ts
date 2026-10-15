import "server-only";

import { mayEnterReviewQueue } from "@/lib/messages/disposition";
import { serializeReviewerMessage } from "@/lib/presentation";
import type { AuthenticatedPlayer } from "@/lib/players/auth";
import {
  createMessageReviewAssignment,
  createSeedReviewAssignment,
} from "./assignments";
import { loadMessageReviewPresentation, loadSeedReviewPresentation } from "./context";
import { pickNextQueueTarget } from "./queue";
import type { ReviewsDatabase } from "./db";
import type { ReviewAssignmentPayload } from "./types";

export type ReviewAssignResult =
  | { ok: true; payload: ReviewAssignmentPayload }
  | { ok: false; status: number; error: string; code?: string };

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
  ).first<{ author_id: string; filter_outcome: string; status: string }>();

  if (!row) {
    return { ok: false, status: 404, error: "That message is not available to judge." };
  }
  if (row.author_id === player.id) {
    return { ok: false, status: 403, error: "You cannot judge your own messages." };
  }
  if (!mayEnterReviewQueue(row.filter_outcome as "passed" | "blocked", row.status as "pending")) {
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

async function buildMessageAssignmentPayload(
  db: ReviewsDatabase,
  player: AuthenticatedPlayer,
  messageId: string,
  preferHandPicked: boolean,
  now: number,
): Promise<ReviewAssignResult> {
  const eligibility = await validateMessageEligibility(db, messageId, player);
  if (!eligibility.ok) return eligibility;

  const created = await createMessageReviewAssignment(
    db,
    player.id,
    messageId,
    preferHandPicked,
    now,
  );

  const presentation = await loadMessageReviewPresentation(db, messageId);
  if (!presentation) {
    return { ok: false, status: 404, error: "That message is not available to judge." };
  }

  return {
    ok: true,
    payload: {
      assignmentId: created.id,
      assignment: created.assignment,
      kind: "message",
      messageId,
      presentation: serializeReviewerMessage(presentation),
    },
  };
}

export async function assignNextFromQueue(
  db: ReviewsDatabase,
  player: AuthenticatedPlayer,
): Promise<ReviewAssignResult> {
  const now = Math.floor(Date.now() / 1000);
  const target = await pickNextQueueTarget(db, player);
  if (!target) {
    return {
      ok: false,
      status: 404,
      error: "Nothing is waiting for review right now.",
      code: "queue_empty",
    };
  }

  if (target.kind === "seed") {
    const presentation = await loadSeedReviewPresentation(db, target.seedCaseId);
    if (!presentation) {
      return {
        ok: false,
        status: 404,
        error: "Nothing is waiting for review right now.",
        code: "queue_empty",
      };
    }
    const created = await createSeedReviewAssignment(db, player.id, target.seedCaseId, now);
    return {
      ok: true,
      payload: {
        assignmentId: created.id,
        assignment: "queue",
        kind: "seed",
        seedCaseId: target.seedCaseId,
        presentation: serializeReviewerMessage(presentation),
      },
    };
  }

  return buildMessageAssignmentPayload(db, player, target.messageId, false, now);
}

export async function assignHandPickedMessage(
  db: ReviewsDatabase,
  player: AuthenticatedPlayer,
  messageId: string,
): Promise<ReviewAssignResult> {
  const trimmed = messageId.trim();
  if (!trimmed) {
    return { ok: false, status: 400, error: "messageId is required." };
  }

  const now = Math.floor(Date.now() / 1000);
  return buildMessageAssignmentPayload(db, player, trimmed, true, now);
}
