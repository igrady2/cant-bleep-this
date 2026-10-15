import "server-only";

import type { ReviewsDatabase } from "./db";

/** Re-evaluate from persisted votes; the pending guard makes retries harmless. */
export async function computeConsensus(db: ReviewsDatabase, messageId: string): Promise<void> {
  await db.prepare(`
    WITH eligible AS (
      SELECT r.verdict, r.assignment, r.created_at, r.rowid AS sequence,
        SUM(CASE WHEN r.assignment = 'hand_picked' THEN 1 ELSE 0 END)
          OVER (ORDER BY r.created_at, r.rowid) AS hand_picked_count
      FROM reviews r
      JOIN messages m ON m.id = r.message_id
      JOIN players p ON p.id = r.player_id
      WHERE r.message_id = ? AND r.player_id <> m.author_id
        AND p.reviewer_standing = 'good' AND r.skipped = 0
        AND r.verdict IN ('fine', 'not_ok')
    ), votes AS (
      SELECT verdict FROM eligible
      WHERE assignment = 'queue' OR hand_picked_count = 1
      ORDER BY created_at, sequence LIMIT 3
    ), consensus AS (
      SELECT verdict FROM votes GROUP BY verdict HAVING COUNT(*) >= 2
    )
    UPDATE messages SET status = CASE
      WHEN filter_outcome = 'passed' THEN
        CASE (SELECT verdict FROM consensus) WHEN 'not_ok' THEN 'slip' ELSE 'clean' END
      ELSE
        CASE (SELECT verdict FROM consensus) WHEN 'not_ok' THEN 'caught' ELSE 'false_positive' END
    END
    WHERE id = ? AND status = 'pending' AND filter_outcome IN ('passed', 'blocked')
      AND EXISTS (SELECT 1 FROM consensus)
  `).bind(messageId, messageId).run!();
}
