import "server-only";
import type { ReviewsDatabase } from "./db";
import { seedStandingMisses, seedStandingWindow } from "./settings";

/** Runs in the submission transaction; skips never change accuracy or standing. */
export function updateStanding(db: ReviewsDatabase, playerId: string, reviewId: string) {
  return db.prepare(`UPDATE players SET reviewer_standing = CASE WHEN (
    SELECT COUNT(*) FROM (
      SELECT seed_correct FROM reviews
      WHERE player_id = ? AND seed_case_id IS NOT NULL AND skipped = 0
        AND seed_correct IS NOT NULL
      ORDER BY created_at DESC, rowid DESC LIMIT ?
    ) WHERE seed_correct = 0
  ) >= ? THEN 'excluded' ELSE 'good' END
  WHERE id = ? AND EXISTS (
    SELECT 1 FROM reviews WHERE id = ? AND player_id = ?
      AND seed_case_id IS NOT NULL AND skipped = 0
  )`).bind(playerId, seedStandingWindow(), seedStandingMisses(), playerId, reviewId, playerId);
}
