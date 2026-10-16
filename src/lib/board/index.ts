import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { loadPublicReleases, type PublicFilterRelease } from "@/lib/filter-release/releases";
import type { MessagesDatabase } from "@/lib/messages/db";

export type { PublicFilterRelease } from "@/lib/filter-release/releases";

export interface BoardEntry { name: string; slips: number }
export interface BoardDatabase {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      all<T>(): Promise<{ results: T[]; success: boolean }>;
    };
  };
}

export function getBoardDatabase(): BoardDatabase | null {
  try {
    return (getCloudflareContext().env as { DB?: BoardDatabase }).DB ?? null;
  } catch {
    return null;
  }
}

export async function loadBoard(db: BoardDatabase, now = new Date()): Promise<BoardEntry[]> {
  const today = now.toISOString().slice(0, 10);
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 89);
  // Exactly 90 UTC score days including today; future rows do not count.
  // Ties: slips descending, then case-sensitive SQLite BINARY name ascending,
  // then internal player id ascending. Only names and counts are public.
  // LIMIT applies after this total ordering; equal counts share a display rank.
  // Read earned daily counts, never re-evaluate messages against patched rules.
  const result = await db.prepare(`
    SELECT p.name, SUM(s.slips) AS slips
    FROM scores s JOIN players p ON p.id = s.player_id
    WHERE s.day >= ? AND s.day <= ? AND p.banned_at IS NULL
    GROUP BY p.id
    HAVING SUM(s.slips) > 0
    ORDER BY slips DESC, p.name COLLATE BINARY ASC, p.id COLLATE BINARY ASC
    LIMIT 50
  `).bind(start.toISOString().slice(0, 10), today).all<BoardEntry>();
  if (!result.success) throw new Error("Board query failed");
  return result.results;
}

/** Released filter versions and how many slips each patched (#26). Scores are untouched. */
export function loadBoardReleases(db: BoardDatabase): Promise<PublicFilterRelease[]> {
  // Same D1 binding; the release reader only needs prepare/bind/all.
  return loadPublicReleases(db as unknown as MessagesDatabase);
}
