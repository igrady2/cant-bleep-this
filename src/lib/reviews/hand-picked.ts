import "server-only";

import type { ReviewsDatabase } from "./db";

export async function reserveHandPickedSlot(
  db: ReviewsDatabase,
  messageId: string,
  now: number,
): Promise<boolean> {
  const statement = db
    .prepare(
      `INSERT INTO hand_picked_review_reservations (message_id, reserved_at)
       SELECT ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM reviews
         WHERE message_id = ? AND assignment = 'hand_picked' AND skipped = 0
       )
       AND NOT EXISTS (
         SELECT 1 FROM hand_picked_review_reservations WHERE message_id = ?
       )`,
    )
    .bind(messageId, now, messageId, messageId);

  const result = await (statement as { run(): Promise<{ meta?: { changes?: number } }> }).run();
  return (result.meta?.changes ?? 0) > 0;
}
