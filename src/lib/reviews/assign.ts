import "server-only";

import { mayEnterReviewQueue } from "@/lib/messages/disposition";
import { serializeReviewerMessage } from "@/lib/presentation";
import type { AuthenticatedPlayer } from "@/lib/players/auth";
import {
  createMessageReviewAssignment,
  createSeedReviewAssignment,
  consumeReviewAssignment,
  findOpenReviewAssignment,
} from "./assignments";
import { loadMessageReviewPresentation, loadSeedReviewPresentation } from "./context";
import { validateMessageEligibility } from "./eligibility";
import { pickNextQueueTarget } from "./queue";
import type { ReviewsDatabase } from "./db";
import type { ReviewAssignResult } from "./types";

export type { ReviewAssignResult } from "./types";

async function buildMessageAssignmentPayload(
  db: ReviewsDatabase,
  player: AuthenticatedPlayer,
  messageId: string,
  preferHandPicked: boolean,
  now: number,
): Promise<ReviewAssignResult> {
  const eligibility = await validateMessageEligibility(db, messageId, player);
  if (!eligibility.ok) return eligibility;

  const presentation = await loadMessageReviewPresentation(db, messageId);
  if (!presentation) {
    return { ok: false, status: 404, error: "That message is not available to judge." };
  }
  const created = await createMessageReviewAssignment(db, player.id, messageId, preferHandPicked, now);

  return {
    ok: true,
    payload: {
      assignmentId: created.id,
      assignment: created.assignment,
      ...(preferHandPicked ? { messageId } : {}),
      presentation: serializeReviewerMessage(presentation),
    },
  };
}

export async function assignNextFromQueue(
  db: ReviewsDatabase,
  player: AuthenticatedPlayer,
): Promise<ReviewAssignResult> {
  const now = Math.floor(Date.now() / 1000);
  let open = await findOpenReviewAssignment(db, player.id, now);
  while (open) {
    const presentation = open.message_id
      ? await loadMessageReviewPresentation(db, open.message_id)
      : await loadSeedReviewPresentation(db, open.seed_case_id!);
    if (open.message_id && (!presentation || !mayEnterReviewQueue(presentation.filterOutcome, presentation.status))) {
      await consumeReviewAssignment(db, open.id, player.id, now);
      open = await findOpenReviewAssignment(db, player.id, now);
      continue;
    }
    if (!presentation) {
      return { ok: false, status: 404, error: "That message is not available to judge." };
    }
    return { ok: true, payload: {
      assignmentId: open.id,
      assignment: open.assignment,
      presentation: serializeReviewerMessage(presentation),
    } };
  }
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
