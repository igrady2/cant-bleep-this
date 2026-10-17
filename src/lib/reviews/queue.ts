import "server-only";
import { databaseRows } from "@/lib/messages/db";

import { CATEGORIES } from "@/lib/moderation/categories";
import { mayEnterReviewQueue } from "@/lib/messages/disposition";
import type { FilterOutcome } from "@/lib/moderation/types";
import type { MessageStatus } from "@/lib/messages/disposition";
import type { FilterScores } from "@/lib/moderation/types";
import type { AuthenticatedPlayer } from "@/lib/players/auth";
import { smallestRuleThresholdGap } from "./uncertainty";
import {
  pickRandom,
  queueScanLimit,
  queueSeedFraction,
  queueUncertainFraction,
  randomUnit,
} from "./settings";
import type { ReviewsDatabase } from "./db";

interface QueueCandidateRow {
  id: string;
  filter_outcome: FilterOutcome;
  status: MessageStatus;
  filter_scores: string;
  created_at: number;
}

interface SeedCandidateRow {
  id: string;
}

export async function listQueueCandidates(
  db: ReviewsDatabase,
  player: AuthenticatedPlayer,
): Promise<QueueCandidateRow[]> {
  const rows = await (
    db
      .prepare(
        `SELECT m.id, m.filter_outcome, m.status, m.filter_scores, m.created_at
         FROM messages m
         WHERE m.status = 'pending'
           AND m.filter_outcome IN ('passed', 'blocked')
           AND m.author_id <> ?
           AND NOT EXISTS (
             SELECT 1 FROM reviews r
             WHERE r.message_id = m.id AND r.player_id = ?
           )
         ORDER BY m.created_at ASC, m.id ASC
         LIMIT ?`,
      )
      .bind(player.id, player.id, queueScanLimit()) as { all<T>(): Promise<T[]> }
  ).all<QueueCandidateRow>();

  return databaseRows(rows).filter((row) => mayEnterReviewQueue(row.filter_outcome, row.status));
}

async function listSeedCandidates(
  db: ReviewsDatabase,
  playerId: string,
): Promise<SeedCandidateRow[]> {
  const rows = await (
    db
      .prepare(
        `SELECT tc.id
         FROM test_cases tc
         WHERE tc.source = 'seed'
           AND (tc.expected_verdict = 'fine' OR tc.rule IN (${CATEGORIES.map(() => '?').join(', ')}))
           AND NOT EXISTS (
             SELECT 1 FROM reviews r
             WHERE r.seed_case_id = tc.id AND r.player_id = ?
           )
         LIMIT ?`,
      )
      .bind(...CATEGORIES.map(c => c.id), playerId, queueScanLimit()) as {
        all<T>(): Promise<T[] | { results: T[] }>;
      }
  ).all<SeedCandidateRow>();

  return databaseRows(rows);
}

export function pickUncertainCandidate(
  candidates: readonly QueueCandidateRow[],
): QueueCandidateRow | null {
  if (candidates.length === 0) return null;

  let bestGap = Number.POSITIVE_INFINITY;
  const gaps = candidates.map((candidate) => {
    const scores = JSON.parse(candidate.filter_scores) as FilterScores;
    const gap = smallestRuleThresholdGap(scores);
    if (gap < bestGap) bestGap = gap;
    return { candidate, gap };
  });

  const tied = gaps.filter((entry) => entry.gap === bestGap).map((entry) => entry.candidate);
  return pickRandom(tied);
}

export function pickRandomCandidate(
  candidates: readonly QueueCandidateRow[],
): QueueCandidateRow | null {
  return pickRandom(candidates);
}

export async function pickNextQueueTarget(
  db: ReviewsDatabase,
  player: AuthenticatedPlayer,
): Promise<{ kind: "message"; messageId: string } | { kind: "seed"; seedCaseId: string } | null> {
  if (randomUnit() < queueSeedFraction()) {
    const seeds = await listSeedCandidates(db, player.id);
    const seed = pickRandom(seeds);
    if (seed) return { kind: "seed", seedCaseId: seed.id };
  }

  const candidates = await listQueueCandidates(db, player);
  if (candidates.length === 0) return null;

  const uncertain = randomUnit() < queueUncertainFraction();
  const picked = uncertain
    ? pickUncertainCandidate(candidates)
    : pickRandomCandidate(candidates);

  if (!picked) return null;
  return { kind: "message", messageId: picked.id };
}
