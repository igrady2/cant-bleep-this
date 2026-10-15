import "server-only";

import type { ReviewsDatabase } from "./db";
import { reviewRequirementTiers } from "./settings";

export function reviewRequiredFailure() {
  return {
    ok: false as const,
    status: 409 as const,
    code: "review_required" as const,
    error: "Review or skip one message from the queue before posting again. Your draft is saved.",
  };
}

export function postsAllowedBetweenReviews(queueSize: number): number | null {
  return reviewRequirementTiers().filter((tier) => queueSize >= tier.queueSize).at(-1)?.posts ?? null;
}

// Count messages, not votes or seeds; exclude decided and off-limits messages.
const QUEUE_SIZE = `(SELECT COUNT(*) FROM messages
  WHERE status = 'pending' AND filter_outcome IN ('passed', 'blocked'))`;

export async function findReviewRequirementBlock(db: ReviewsDatabase, playerId: string) {
  const row = await db.prepare(`SELECT ${QUEUE_SIZE} AS queue_size,
    COALESCE((SELECT posts_since_review FROM player_review_progress WHERE player_id = ?), 0) AS posts`)
    .bind(playerId).first!<{ queue_size: number; posts: number }>();
  const limit = postsAllowedBetweenReviews(row!.queue_size);
  return limit !== null && row!.posts >= limit ? reviewRequiredFailure() : null;
}

/** Include before the message insert in its D1 batch: CHECK aborts the entire
 * transaction if another post used the last allowance while Jev was running. */
export function recordPostForReviewRequirement(db: ReviewsDatabase, playerId: string) {
  const tiers = [...reviewRequirementTiers()].reverse();
  const limit = `CASE ${tiers.map(() => `WHEN ${QUEUE_SIZE} >= ? THEN ?`).join(" ")} ELSE NULL END`;
  return db.prepare(`INSERT INTO player_review_progress (player_id, posts_since_review)
    VALUES (?, 1)
    ON CONFLICT(player_id) DO UPDATE SET posts_since_review =
      CASE WHEN posts_since_review >= (${limit}) THEN -1 ELSE posts_since_review + 1 END`)
    .bind(playerId, ...tiers.flatMap((tier) => [tier.queueSize, tier.posts]));
}

/** Only a persisted valid review resets progress; stale/failed inserts do not. */
export function resetReviewRequirement(db: ReviewsDatabase, playerId: string, reviewId: string) {
  return db.prepare(`INSERT INTO player_review_progress (player_id, posts_since_review)
    SELECT ?, 0 FROM reviews WHERE id = ? AND player_id = ?
      AND (skipped = 0 OR assignment = 'queue')
    ON CONFLICT(player_id) DO UPDATE SET posts_since_review = 0`)
    .bind(playerId, reviewId, playerId);
}

export function isReviewRequirementError(error: unknown): boolean {
  return String(error).includes("review_requirement_nonnegative");
}
