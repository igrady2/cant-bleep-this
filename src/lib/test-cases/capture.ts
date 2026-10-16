import "server-only";

import { databaseRows, type MessagesDatabase } from "@/lib/messages/db";
import { mayEnterTestCase, type MessageStatus } from "@/lib/messages/disposition";
import { ACTIVE_FILTER_VERSION_ID } from "@/lib/moderation/filter-versions";
import type { FilterOutcome } from "@/lib/moderation/types";
import { normalizeUsername } from "@/lib/players/policy";
import { serializeTestCase } from "@/lib/presentation";
import { loadDecidingNotOkVotes } from "@/lib/reviews/censorship";
import { loadMessageReviewPresentation } from "@/lib/reviews/context";
import { Anonymizer, candidateUsernames } from "./anonymize";

export type TestCaseCaptureResult =
  | "captured"
  | "already_captured"
  | "pending"
  | "ineligible"
  | "not_found";

const EXPECTED_VERDICT: Partial<Record<MessageStatus, "fine" | "not_ok">> = {
  slip: "not_ok",
  caught: "not_ok",
  clean: "fine",
  false_positive: "fine",
};

/** D1 caps bound parameters per statement. */
const LOOKUP_CHUNK = 90;

interface SourceRow {
  status: MessageStatus;
  filter_outcome: FilterOutcome;
}

async function registeredNames(db: MessagesDatabase, candidates: readonly string[]): Promise<string[]> {
  const names: string[] = [];
  for (let i = 0; i < candidates.length; i += LOOKUP_CHUNK) {
    const chunk = candidates.slice(i, i + LOOKUP_CHUNK);
    const rows = await db
      .prepare(`SELECT normalized_name FROM players WHERE normalized_name IN (${chunk.map(() => "?").join(", ")})`)
      .bind(...chunk)
      .all!<{ normalized_name: string }>();
    names.push(...databaseRows(rows).map((row) => row.normalized_name));
  }
  return names;
}

/**
 * Snapshots a decided message into the permanent test set (#22). Safe to call
 * repeatedly: one case per source message. The case copies everything it needs,
 * so deleting the source after 90 days leaves it intact. Off-limits and
 * maintainer-excluded messages never enter; maintainer deletion removes the case.
 */
export async function captureTestCase(
  db: MessagesDatabase,
  messageId: string,
): Promise<TestCaseCaptureResult> {
  const source = await db
    .prepare(`SELECT status, filter_outcome FROM messages WHERE id = ? LIMIT 1`)
    .bind(messageId)
    .first!<SourceRow>();
  if (!source) return "not_found";
  if (!mayEnterTestCase(source.filter_outcome, source.status)) return "ineligible";
  const expectedVerdict = EXPECTED_VERDICT[source.status];
  if (!expectedVerdict) return "pending";

  const existing = await db
    .prepare(`SELECT 1 AS found FROM test_cases WHERE source_message_id = ? LIMIT 1`)
    .bind(messageId)
    .first!<{ found: number }>();
  if (existing) return "already_captured";

  const presentation = await loadMessageReviewPresentation(db, messageId);
  if (!presentation) return "ineligible";

  const deciding = expectedVerdict === "not_ok" ? await loadDecidingNotOkVotes(db, [messageId]) : [];
  const reasons = deciding.map((vote) => vote.reason).filter((reason): reason is string => !!reason);

  // Room members plus any registered player mentioned anywhere in the case.
  const texts = [presentation.text, ...presentation.context.map((entry) => entry.text), ...reasons];
  const known = new Set([
    normalizeUsername(presentation.username),
    ...presentation.context.map((entry) => normalizeUsername(entry.username)),
    ...(await registeredNames(db, candidateUsernames(texts))),
  ]);

  // Reading order: context first, then the message, then reviewers' reasons.
  const anonymizer = new Anonymizer(known);
  const context = presentation.context.map((entry) => ({
    ...entry,
    username: anonymizer.username(entry.username),
    text: anonymizer.text(entry.text),
  }));
  const username = anonymizer.username(presentation.username);
  const text = anonymizer.text(presentation.text);
  const anonymizedReasons = reasons.map((reason) => anonymizer.text(reason));

  // Anonymize before masking so a digit-heavy username is still recognized.
  const masked = serializeTestCase({
    ...presentation,
    username,
    text,
    context,
    reasons: anonymizedReasons,
  });

  const result = await db
    .prepare(`
      INSERT INTO test_cases (
        id, message, context_snapshot, expected_verdict, rule, reasons, source,
        version_added, source_message_id, filter_scores, filter_version, source_status
      )
      SELECT ?, ?, ?, ?, ?, ?, 'game', ?, id, filter_scores, filter_version, status
      FROM messages
      WHERE id = ? AND status = ? AND filter_outcome IN ('passed', 'blocked')
      ON CONFLICT (source_message_id) DO NOTHING
    `)
    .bind(
      crypto.randomUUID(),
      masked.text,
      JSON.stringify(masked.context.map((entry) => ({ username: entry.username, text: entry.text }))),
      expectedVerdict,
      expectedVerdict === "not_ok" ? (deciding[0]?.rule ?? null) : null,
      JSON.stringify(masked.reasons),
      ACTIVE_FILTER_VERSION_ID,
      messageId,
      source.status,
    )
    .run!();
  return (result.meta?.changes ?? 0) > 0 ? "captured" : "already_captured";
}
