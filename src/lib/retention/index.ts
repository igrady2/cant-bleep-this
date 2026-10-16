// Nightly 90-day retention (#27). Runs from the Worker's scheduled handler, so it
// must not import "server-only" or read the OpenNext request context.

/** Everything except the permanent test set is kept for this many days. */
export const RETENTION_DAYS = 90;
/** Rows touched by one DELETE or UPDATE statement. */
export const RETENTION_BATCH_SIZE = 200;
/**
 * Rows touched by one nightly run, so a backlog spreads over several nights
 * instead of exhausting the D1 free plan's 100,000 rows written a day.
 */
export const RETENTION_MAX_ROWS_PER_RUN = 10_000;

const DAY_SECONDS = 24 * 60 * 60;

/** Minimal D1 surface for retention: every step is a bounded write. */
export interface RetentionDatabase {
  prepare(query: string): {
    bind(...values: unknown[]): RetentionStatement;
  };
}

export interface RetentionStatement {
  run(): Promise<{ meta?: { changes?: number } }>;
}

export interface RetentionOptions {
  batchSize?: number;
  maxRowsPerRun?: number;
}

export interface RetentionResult {
  /** Rows changed per step, in the order the steps ran. */
  steps: Record<string, number>;
  total: number;
  /** True when the per-run cap stopped the run; the next night continues. */
  capped: boolean;
}

export interface RetentionCutoffs {
  /** Rows with created_at (Unix seconds) before this have expired. */
  expiresBefore: number;
  /**
   * First score day still on the board: exactly 90 UTC days including today,
   * matching loadBoard. Daily rows before it have expired.
   */
  firstKeptDay: string;
}

export function retentionCutoffs(now: Date): RetentionCutoffs {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const today = now.toISOString().slice(0, 10);
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (RETENTION_DAYS - 1));
  return {
    expiresBefore: nowSeconds - RETENTION_DAYS * DAY_SECONDS,
    firstKeptDay: start.toISOString().slice(0, 10),
  };
}

/**
 * Players whose name is released. last_played_at starts at the claim time
 * (claim.ts sets it to created_at) and moves only when the player posts, so a
 * name that was claimed and never used is released 90 days after the claim.
 * Reviewing does not hold a name. Banned names are never released, so a ban
 * cannot be undone by waiting it out.
 */
const RELEASED_PLAYERS = `SELECT id FROM players WHERE last_played_at < ?1 AND banned_at IS NULL`;
const EXPIRED_MESSAGES = `SELECT id FROM messages WHERE created_at < ?1`;

interface Step {
  name: string;
  table: string;
  /** Selects rows of `table` to remove; ?1 is the cutoff, which a step may ignore. */
  where: string;
  cutoff: (cutoffs: RetentionCutoffs) => number | string;
}

/**
 * Dependents are removed before their parents, so no step relies on
 * ON DELETE CASCADE and an interrupted run never leaves orphans. test_cases is
 * never touched: captured cases are self-contained, with no FK to game rows.
 */
const DELETE_STEPS: Step[] = [
  // Messages older than 90 days, their reviews and assignments first.
  {
    name: "expired_reviews",
    table: "reviews",
    where: `created_at < ?1 OR message_id IN (${EXPIRED_MESSAGES})`,
    cutoff: (c) => c.expiresBefore,
  },
  {
    name: "expired_assignments",
    table: "review_assignments",
    where: `created_at < ?1 OR message_id IN (${EXPIRED_MESSAGES})`,
    cutoff: (c) => c.expiresBefore,
  },
  {
    name: "expired_messages",
    table: "messages",
    where: `created_at < ?1
      AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.message_id = messages.id)
      AND NOT EXISTS (SELECT 1 FROM review_assignments a WHERE a.message_id = messages.id)`,
    cutoff: (c) => c.expiresBefore,
  },
  // Daily rows outside the 90-day board window.
  { name: "expired_scores", table: "scores", where: `day < ?1`, cutoff: (c) => c.firstKeptDay },
  { name: "expired_player_daily_posts", table: "player_daily_posts", where: `day < ?1`, cutoff: (c) => c.firstKeptDay },
  { name: "expired_site_daily_posts", table: "site_daily_posts", where: `day < ?1`, cutoff: (c) => c.firstKeptDay },
  { name: "expired_ip_daily_claims", table: "ip_daily_claims", where: `day < ?1`, cutoff: (c) => c.firstKeptDay },
  // Maintainer removals can leave a zero day; it adds nothing to the board.
  { name: "empty_scores", table: "scores", where: `slips = 0`, cutoff: (c) => c.firstKeptDay },
  // Released names: everything that references the player, then the player.
  {
    name: "released_reviews",
    table: "reviews",
    where: `player_id IN (${RELEASED_PLAYERS})
      OR message_id IN (SELECT id FROM messages WHERE author_id IN (${RELEASED_PLAYERS}))`,
    cutoff: (c) => c.expiresBefore,
  },
  {
    name: "released_assignments",
    table: "review_assignments",
    where: `player_id IN (${RELEASED_PLAYERS})
      OR message_id IN (SELECT id FROM messages WHERE author_id IN (${RELEASED_PLAYERS}))`,
    cutoff: (c) => c.expiresBefore,
  },
  {
    name: "released_messages",
    table: "messages",
    where: `author_id IN (${RELEASED_PLAYERS})
      AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.message_id = messages.id)
      AND NOT EXISTS (SELECT 1 FROM review_assignments a WHERE a.message_id = messages.id)`,
    cutoff: (c) => c.expiresBefore,
  },
  { name: "released_scores", table: "scores", where: `player_id IN (${RELEASED_PLAYERS})`, cutoff: (c) => c.expiresBefore },
  { name: "released_daily_posts", table: "player_daily_posts", where: `player_id IN (${RELEASED_PLAYERS})`, cutoff: (c) => c.expiresBefore },
  { name: "released_review_progress", table: "player_review_progress", where: `player_id IN (${RELEASED_PLAYERS})`, cutoff: (c) => c.expiresBefore },
  {
    name: "released_players",
    table: "players",
    where: `last_played_at < ?1 AND banned_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.author_id = players.id)
      AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.player_id = players.id)
      AND NOT EXISTS (SELECT 1 FROM review_assignments a WHERE a.player_id = players.id)
      AND NOT EXISTS (SELECT 1 FROM scores s WHERE s.player_id = players.id)
      AND NOT EXISTS (SELECT 1 FROM player_daily_posts d WHERE d.player_id = players.id)
      AND NOT EXISTS (SELECT 1 FROM player_review_progress g WHERE g.player_id = players.id)`,
    cutoff: (c) => c.expiresBefore,
  },
];

/**
 * A kept message lists the ids of the 10 messages before it. Once those are
 * deleted, drop the ids so no kept row points at a message that is gone. The
 * remaining ids keep their order.
 */
const PRUNE_CONTEXT_SQL = `UPDATE messages SET context_message_ids = (
    SELECT json_group_array(value) FROM (
      SELECT j.value FROM json_each(messages.context_message_ids) j
      WHERE EXISTS (SELECT 1 FROM messages x WHERE x.id = j.value)
      ORDER BY j.key
    )
  )
  WHERE rowid IN (
    SELECT m.rowid FROM messages m
    WHERE EXISTS (
      SELECT 1 FROM json_each(m.context_message_ids) j
      WHERE NOT EXISTS (SELECT 1 FROM messages x WHERE x.id = j.value)
    )
    LIMIT ?1
  )`;

/**
 * Deletes expired game data in looped, LIMITed batches and stops at the
 * per-run cap. Safe to rerun: every step only matches rows still expired.
 */
export async function runRetention(
  db: RetentionDatabase,
  now: Date,
  options: RetentionOptions = {},
): Promise<RetentionResult> {
  const batchSize = options.batchSize ?? RETENTION_BATCH_SIZE;
  const maxRows = options.maxRowsPerRun ?? RETENTION_MAX_ROWS_PER_RUN;
  const cutoffs = retentionCutoffs(now);
  const steps: Record<string, number> = {};
  let total = 0;

  const loop = async (name: string, build: (limit: number) => RetentionStatement) => {
    let changed = 0;
    while (total < maxRows) {
      const limit = Math.min(batchSize, maxRows - total);
      const result = await build(limit).run();
      const changes = result.meta?.changes ?? 0;
      changed += changes;
      total += changes;
      if (changes < limit) break;
    }
    steps[name] = (steps[name] ?? 0) + changed;
  };

  for (const step of DELETE_STEPS) {
    await loop(step.name, (limit) => db
      .prepare(`DELETE FROM ${step.table} WHERE rowid IN (
        SELECT rowid FROM ${step.table} WHERE ${step.where} LIMIT ?2
      )`)
      .bind(step.cutoff(cutoffs), limit));
  }
  await loop("pruned_context", (limit) => db.prepare(PRUNE_CONTEXT_SQL).bind(limit));

  return { steps, total, capped: total >= maxRows };
}
