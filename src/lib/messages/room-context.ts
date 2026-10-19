import "server-only";

import type { ModerationContextLine } from "@/lib/moderation/context";
import { MAX_CONTEXT_LINES } from "@/lib/moderation/context";
import { mayAppearInContext } from "./disposition";
import { databaseRows, type MessagesDatabase } from "./db";
import type { FilterOutcome } from "@/lib/moderation/types";
import type { MessageStatus } from "./disposition";

interface ContextRow {
  id: string;
  masked_text: string;
  filter_outcome: FilterOutcome;
  status: MessageStatus;
  author_name: string;
}

export interface LoadedPostRoomContext {
  /** Preceding message ids, oldest first (up to 10). */
  contextMessageIds: string[];
  context: ModerationContextLine[];
  roomUsernames: string[];
}

export async function loadPostRoomContext(
  db: MessagesDatabase,
): Promise<LoadedPostRoomContext> {
  const contextRows = await (
    db
      .prepare(
        `SELECT m.id, m.masked_text, m.filter_outcome, m.status, p.name AS author_name
         FROM messages m
         INNER JOIN players p ON p.id = m.author_id
         WHERE m.filter_outcome <> 'off_limits' AND m.status <> 'excluded'
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT ?`,
      )
      .bind(MAX_CONTEXT_LINES) as {
      all<T>(): Promise<T[] | { results: T[] }>;
    }
  ).all<ContextRow>();

  // D1 returns { results }; test fakes may return a bare array.
  const deliverable = databaseRows(contextRows).filter((row) =>
    mayAppearInContext(row.filter_outcome, row.status),
  );

  const chronological = [...deliverable].reverse();
  const contextMessageIds = chronological.map((row) => row.id);
  const context: ModerationContextLine[] = chronological.map((row) => ({
    username: row.author_name,
    text: row.masked_text,
  }));

  const usernameRows = await (
    db
      .prepare("SELECT name FROM players ORDER BY name ASC")
      .bind() as { all<T>(): Promise<T[] | { results: T[] }> }
  ).all<{ name: string }>();

  const roomUsernames = databaseRows(usernameRows).map((row) => row.name);

  return { contextMessageIds, context, roomUsernames };
}
