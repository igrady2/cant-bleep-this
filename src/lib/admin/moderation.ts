import "server-only";

import { databaseRows, type MessagesDatabase } from "@/lib/messages/db";
import { maskPersonalInformation } from "@/lib/presentation";

export async function banPlayerAsMaintainer(db: MessagesDatabase, playerId: string, actor: string) {
  if (!actor.trim()) throw new Error("A verified maintainer identity is required.");
  await db.batch([
    db.prepare(`INSERT INTO moderation_actions (id, action, target_id, actor, details, created_at)
      SELECT ?, 'ban_player', id, ?, '{}', unixepoch() FROM players WHERE id = ? AND banned_at IS NULL
      ON CONFLICT (action, target_id) DO NOTHING`).bind(crypto.randomUUID(), actor, playerId),
    db.prepare("UPDATE players SET banned_at = unixepoch() WHERE id = ? AND banned_at IS NULL").bind(playerId),
  ]);
  return !!(await db.prepare("SELECT 1 AS found FROM players WHERE id = ? AND banned_at IS NOT NULL")
    .bind(playerId).first!());
}

/** Raw text, tokens and off-limits bodies never reach the admin browser. */
export async function loadModerationMessages(db: MessagesDatabase) {
  const rows = databaseRows(await db.prepare(`SELECT m.id, m.author_id AS playerId, p.name,
      p.banned_at AS bannedAt, m.masked_text AS text, m.status
    FROM messages m JOIN players p ON p.id = m.author_id
    WHERE m.filter_outcome <> 'off_limits' AND m.status <> 'excluded'
    ORDER BY m.created_at DESC, m.id DESC LIMIT 50`).bind().all!<{
      id: string; playerId: string; name: string; bannedAt: number | null; text: string; status: string;
    }>());
  return rows.map((row) => ({ ...row, text: maskPersonalInformation(row.text) }));
}
