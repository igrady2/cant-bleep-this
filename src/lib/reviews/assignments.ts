import "server-only";

import type { ReviewAssignment } from "./types";
import type { ReviewsDatabase } from "./db";
import { assignmentTtlSeconds } from "./settings";

export interface CreatedReviewAssignment {
  id: string;
  assignment: ReviewAssignment;
}

export async function releaseExpiredReviewAssignments(
  db: ReviewsDatabase,
  now: number,
  messageId?: string,
): Promise<void> {
  if (messageId) {
    await (
      db
        .prepare(
          `UPDATE review_assignments
           SET consumed_at = expires_at
           WHERE message_id = ?
             AND consumed_at IS NULL
             AND expires_at <= ?`,
        )
        .bind(messageId, now) as { run(): Promise<unknown> }
    ).run();
    return;
  }

  await (
    db
      .prepare(
        `UPDATE review_assignments
         SET consumed_at = expires_at
         WHERE consumed_at IS NULL AND expires_at <= ?`,
      )
      .bind(now) as { run(): Promise<unknown> }
  ).run();
}

async function insertHandPickedAssignment(
  db: ReviewsDatabase,
  playerId: string,
  messageId: string,
  now: number,
): Promise<CreatedReviewAssignment | null> {
  const id = crypto.randomUUID();
  const expiresAt = now + assignmentTtlSeconds();
  const result = await (
    db
      .prepare(
        `INSERT INTO review_assignments (
           id, player_id, message_id, assignment, created_at, expires_at
         )
         SELECT ?, ?, ?, 'hand_picked', ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM reviews
           WHERE message_id = ? AND assignment = 'hand_picked' AND skipped = 0
         )
         AND NOT EXISTS (
           SELECT 1 FROM review_assignments
           WHERE message_id = ?
             AND assignment = 'hand_picked'
             AND consumed_at IS NULL
             AND expires_at > ?
         )`,
      )
      .bind(
        id,
        playerId,
        messageId,
        now,
        expiresAt,
        messageId,
        messageId,
        now,
      ) as { run(): Promise<{ meta?: { changes?: number } }> }
  ).run();

  if ((result.meta?.changes ?? 0) === 0) return null;
  return { id, assignment: "hand_picked" };
}

async function insertQueueMessageAssignment(
  db: ReviewsDatabase,
  playerId: string,
  messageId: string,
  now: number,
): Promise<CreatedReviewAssignment> {
  const id = crypto.randomUUID();
  const expiresAt = now + assignmentTtlSeconds();
  await (
    db
      .prepare(
        `INSERT INTO review_assignments (
           id, player_id, message_id, assignment, created_at, expires_at
         ) VALUES (?, ?, ?, 'queue', ?, ?)`,
      )
      .bind(id, playerId, messageId, now, expiresAt) as { run(): Promise<unknown> }
  ).run();
  return { id, assignment: "queue" };
}

export async function createMessageReviewAssignment(
  db: ReviewsDatabase,
  playerId: string,
  messageId: string,
  preferHandPicked: boolean,
  now: number,
): Promise<CreatedReviewAssignment> {
  await releaseExpiredReviewAssignments(db, now, messageId);

  if (preferHandPicked) {
    const handPicked = await insertHandPickedAssignment(db, playerId, messageId, now);
    if (handPicked) return handPicked;
  }

  return insertQueueMessageAssignment(db, playerId, messageId, now);
}

export async function createSeedReviewAssignment(
  db: ReviewsDatabase,
  playerId: string,
  seedCaseId: string,
  now: number,
): Promise<CreatedReviewAssignment> {
  const id = crypto.randomUUID();
  const expiresAt = now + assignmentTtlSeconds();
  await (
    db
      .prepare(
        `INSERT INTO review_assignments (
           id, player_id, seed_case_id, assignment, created_at, expires_at
         ) VALUES (?, ?, ?, 'queue', ?, ?)`,
      )
      .bind(id, playerId, seedCaseId, now, expiresAt) as { run(): Promise<unknown> }
  ).run();
  return { id, assignment: "queue" };
}
