import "server-only";

import type { MessagesDatabase } from "./db";

export type MaintainerRemovalDatabase = MessagesDatabase;
export type { MessagesStatement as MaintainerRemovalStatement } from "./db";

/** Permanent test cases never include maintainer-deleted messages. */
export function maintainerRemovalEntersTestSet(): false { return false; }

/** All writes share one D1 transaction. SQL reads the current row, not a stale preflight. */
export async function removeMessageAsMaintainer(
  db: MessagesDatabase,
  messageId: string,
  actor: string,
): Promise<"not_found" | { slipPointRemoved: boolean }> {
  if (!actor.trim()) throw new Error("A verified maintainer identity is required.");
  const results = await db.batch([
    db.prepare(`INSERT INTO moderation_actions (id, action, target_id, actor, details, created_at)
      SELECT ?, 'delete_message', ?, ?, '{}', unixepoch()
      WHERE EXISTS (SELECT 1 FROM messages WHERE id = ?)
         OR EXISTS (SELECT 1 FROM test_cases WHERE source_message_id = ?)
      ON CONFLICT (action, target_id) DO NOTHING`).bind(crypto.randomUUID(), messageId, actor, messageId, messageId),
    db.prepare(`UPDATE scores SET slips = slips - 1
      WHERE slips > 0 AND EXISTS (
        SELECT 1 FROM messages m WHERE m.id = ? AND m.author_id = scores.player_id
          AND m.status = 'slip' AND m.filter_outcome = 'passed' AND m.slip_day = scores.day
      )`).bind(messageId),
    db.prepare("DELETE FROM test_cases WHERE source = 'game' AND source_message_id = ?").bind(messageId),
    // Older snapshots have no per-line provenance. Drop their context when the
    // live source identifies a deleted predecessor; preserve the labeled case.
    db.prepare(`UPDATE test_cases SET context_snapshot = '[]'
      WHERE source = 'game' AND EXISTS (
        SELECT 1 FROM messages m, json_each(m.context_message_ids) j
        WHERE m.id = test_cases.source_message_id AND j.value = ?
      ) AND EXISTS (SELECT 1 FROM json_each(context_snapshot) j
        WHERE json_extract(j.value, '$.sourceMessageId') IS NULL)`).bind(messageId),
    db.prepare(`UPDATE test_cases SET context_snapshot = (
      SELECT json_group_array(json(value)) FROM (
        SELECT j.value FROM json_each(test_cases.context_snapshot) j
        WHERE json_extract(j.value, '$.sourceMessageId') IS NOT ? ORDER BY j.key
      )) WHERE source = 'game' AND EXISTS (
        SELECT 1 FROM json_each(context_snapshot) j
        WHERE json_extract(j.value, '$.sourceMessageId') = ?
      )`).bind(messageId, messageId),
    db.prepare(`UPDATE messages SET context_message_ids = (
      SELECT json_group_array(value) FROM (
        SELECT j.value FROM json_each(messages.context_message_ids) j
        WHERE j.value <> ? ORDER BY j.key
      )) WHERE EXISTS (SELECT 1 FROM json_each(context_message_ids) WHERE value = ?)`)
      .bind(messageId, messageId),
    db.prepare("DELETE FROM messages WHERE id = ?").bind(messageId),
  ]) as { meta?: { changes?: number } }[];
  if (!(results[0]?.meta?.changes)) return "not_found";
  return { slipPointRemoved: (results[1]?.meta?.changes ?? 0) > 0 };
}
