import "server-only";

import type { MessageStatus } from "./disposition";

/** Minimal D1 surface for maintainer hard-delete (#24 will pass the real binding). */
export interface MaintainerRemovalDatabase {
  prepare(query: string): {
    bind(...values: unknown[]): MaintainerRemovalStatement;
  };
  batch(statements: MaintainerRemovalStatement[]): Promise<unknown[]>;
}

export interface MaintainerRemovalStatement {
  first?<T>(): Promise<T | null>;
  sql?: string;
  args?: unknown[];
}

declare global {
  interface CloudflareEnv {
    DB?: MaintainerRemovalDatabase;
  }
}

interface MessageRow {
  id: string;
  author_id: string;
  status: MessageStatus;
  created_at: number;
}

function utcScoreDay(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

/** Permanent test cases never include maintainer-deleted messages. */
export function maintainerRemovalEntersTestSet(): false {
  return false;
}

/**
 * Hard-deletes a message per the PRD. Confirmed slips lose their board point.
 * Admin routing (#24) calls this; it is not exposed to players.
 */
export async function removeMessageAsMaintainer(
  db: MaintainerRemovalDatabase,
  messageId: string,
): Promise<"not_found" | { slipPointRemoved: boolean }> {
  const select = db
    .prepare("SELECT id, author_id, status, created_at FROM messages WHERE id = ?")
    .bind(messageId) as MaintainerRemovalStatement & {
    first<T>(): Promise<T | null>;
  };
  const row = await select.first<MessageRow>();

  if (!row) return "not_found";

  const statements: MaintainerRemovalStatement[] = [];
  const slipPointRemoved = row.status === "slip";
  if (slipPointRemoved) {
    statements.push(
      db
        .prepare(
          "UPDATE scores SET slips = slips - 1 WHERE player_id = ? AND day = ? AND slips > 0",
        )
        .bind(row.author_id, utcScoreDay(row.created_at)),
    );
  }
  statements.push(db.prepare("DELETE FROM messages WHERE id = ?").bind(messageId));
  await db.batch(statements);

  return { slipPointRemoved };
}
