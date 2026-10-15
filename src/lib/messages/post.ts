import "server-only";

import {
  findReviewRequirementBlock,
  recordPostForReviewRequirement,
  isReviewRequirementError,
  reviewRequiredFailure,
} from "@/lib/reviews/review-requirement";
import { CATEGORIES } from "@/lib/moderation/categories";
import { moderate } from "@/lib/moderation";
import { offLimitsThreshold, reviewableThreshold } from "@/lib/moderation/thresholds";
import { TypeSafeError } from "@/lib/moderation/typesafe";
import type { FilterOutcome, ModerationResult } from "@/lib/moderation/types";
import type { FilterScores } from "@/lib/moderation/types";
import { maskPersonalInformation } from "@/lib/presentation";
import type { AuthenticatedPlayer } from "@/lib/players/auth";
import { utcClaimDay } from "@/lib/players/crypto";
import { selfHarmCrisisNoteForScores } from "@/lib/moderation/self-harm-crisis";
import { buildModerationApiBody, type ModerationApiBody } from "./moderation-response";
import { findDailyPostCapBlock, parseDailyCapCheckError } from "./daily-caps";
import {
  ACTIVE_FILTER_VERSION_ID,
  MESSAGE_MAX_LENGTH,
} from "./limits";
import { dispositionFromModeration, type MessageStatus } from "./disposition";
import type { MessagesDatabase } from "./db";
import { loadPostRoomContext } from "./room-context";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseFilterScoresJson(raw: string): FilterScores | null {
  try {
    return JSON.parse(raw) as FilterScores;
  } catch (err) {
    console.error("[post]", err);
    return null;
  }
}

export type PostMessageInput = {
  text: string;
  idempotencyKey?: string;
};

export type PostMessageResult =
  | { ok: true; messageId: string; body: ModerationApiBody }
  | { ok: false; status: number; error: string; code?: string };

interface StoredMessageRow {
  id: string;
  text: string | null;
  filter_outcome: FilterOutcome;
  status: MessageStatus;
  masked_text: string | null;
  filter_scores: string;
}

function isUniqueConstraintError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /unique|constraint/i.test(message);
}

function resolveMessageId(idempotencyKey?: string): string | null {
  const trimmed = idempotencyKey?.trim();
  if (!trimmed) return crypto.randomUUID();
  if (!UUID_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

function moderationResultFromStored(
  row: StoredMessageRow,
): ModerationResult | null {
  if (row.filter_outcome === "off_limits" || row.text == null) {
    return null;
  }

  const stored = parseFilterScoresJson(row.filter_scores);
  if (!stored) return null;
  const limit = reviewableThreshold();
  const offLimit = offLimitsThreshold();
  const offLimitsScore = stored.off_limits ?? 0;
  const scores = Object.fromEntries(
    CATEGORIES.map((category) => [category.id, stored[category.id] ?? 0]),
  ) as ModerationResult["scores"];

  const reviewableFlags = CATEGORIES.filter((c) => scores[c.id] >= limit)
    .map((c) => ({
      category: c.id,
      label: c.label,
      probability: scores[c.id],
      explanation: c.explanation,
    }))
    .sort((a, b) => b.probability - a.probability);

  const outcome = row.filter_outcome;
  return {
    outcome,
    allowed: outcome === "passed",
    provider: "typesafe",
    model: "jev-latest",
    threshold: limit,
    offLimitsThreshold: offLimit,
    flags: outcome === "blocked" ? reviewableFlags : [],
    scores,
    offLimitsScore,
  };
}

async function loadIdempotentPost(
  db: MessagesDatabase,
  messageId: string,
  authorId: string,
): Promise<ModerationApiBody | null> {
  const row = await (
    db
      .prepare(
        `SELECT id, text, filter_outcome, status, masked_text, filter_scores
         FROM messages WHERE id = ? AND author_id = ? LIMIT 1`,
      )
      .bind(messageId, authorId) as { first<T>(): Promise<T | null> }
  ).first<StoredMessageRow>();

  if (!row) return null;

  if (row.filter_outcome === "off_limits") {
    const stored = parseFilterScoresJson(row.filter_scores);
    if (!stored) return null;
    const scores = Object.fromEntries(
      CATEGORIES.map((category) => [category.id, stored[category.id] ?? 0]),
    ) as ModerationResult["scores"];
    const crisisNote = selfHarmCrisisNoteForScores(scores);
    return {
      outcome: "off_limits",
      allowed: false,
      provider: "typesafe",
      ...(crisisNote ? { crisisNote } : {}),
    };
  }

  const moderation = moderationResultFromStored(row);
  if (!moderation || row.text == null) return null;
  return buildModerationApiBody(moderation, row.text);
}

export async function postMessage(
  db: MessagesDatabase,
  player: AuthenticatedPlayer,
  input: PostMessageInput,
): Promise<PostMessageResult> {
  const text = input.text.trim();
  if (!text) {
    return { ok: false, status: 400, error: "Message can't be empty." };
  }
  if (text.length > MESSAGE_MAX_LENGTH) {
    return {
      ok: false,
      status: 400,
      error: `Messages can be up to ${MESSAGE_MAX_LENGTH} characters.`,
    };
  }

  const messageId = resolveMessageId(input.idempotencyKey);
  if (!messageId) {
    return {
      ok: false,
      status: 400,
      error: "idempotencyKey must be a UUID when provided.",
      code: "idempotency",
    };
  }

  const existing = await loadIdempotentPost(db, messageId, player.id);
  if (existing) {
    return { ok: true, messageId, body: existing };
  }

  const capBlock = await findDailyPostCapBlock(db, player.id);
  if (capBlock) {
    return capBlock;
  }

  const reviewBlock = await findReviewRequirementBlock(db, player.id);
  if (reviewBlock) return reviewBlock;

  const { contextMessageIds, context, roomUsernames } = await loadPostRoomContext(db);

  let result: ModerationResult;
  try {
    result = await moderate(text, { context, roomUsernames });
  } catch (err) {
    console.error("[post]", err);
    if (err instanceof TypeSafeError && err.status === 401) {
      return {
        ok: false,
        status: 502,
        error: "The moderation service rejected our API key. Check TYPESAFE_API_KEY.",
        code: "provider_unavailable",
      };
    }
    return {
      ok: false,
      status: 503,
      error:
        "The moderation service is unavailable right now, so your message wasn't posted. Please try again.",
      code: "provider_unavailable",
    };
  }

  const maskedText = maskPersonalInformation(text);
  const disposition = dispositionFromModeration(result, text, maskedText);
  const now = Math.floor(Date.now() / 1000);
  const day = utcClaimDay(now);
  const contextIdsJson = JSON.stringify(contextMessageIds);
  const filterScoresJson = JSON.stringify(disposition.filterScores);

  const bumpPlayer = db
    .prepare(
      `INSERT INTO player_daily_posts (player_id, day, post_count) VALUES (?, ?, 1)
       ON CONFLICT(player_id, day) DO UPDATE SET post_count = post_count + 1`,
    )
    .bind(player.id, day);

  const bumpSite = db
    .prepare(
      `INSERT INTO site_daily_posts (day, post_count) VALUES (?, 1)
       ON CONFLICT(day) DO UPDATE SET post_count = post_count + 1`,
    )
    .bind(day);

  const insertMessage = db
    .prepare(
      `INSERT INTO messages (
        id, author_id, text, masked_text, context_message_ids, filter_scores,
        filter_version, filter_outcome, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      messageId,
      player.id,
      disposition.text,
      disposition.maskedText,
      contextIdsJson,
      filterScoresJson,
      ACTIVE_FILTER_VERSION_ID,
      disposition.filterOutcome,
      disposition.status,
      now,
    );

  const touchPlayer = db
    .prepare("UPDATE players SET last_played_at = ? WHERE id = ?")
    .bind(now, player.id);

  try {
    await db.batch([
      recordPostForReviewRequirement(db, player.id),
      bumpPlayer, bumpSite, insertMessage, touchPlayer,
    ]);
  } catch (err) {
    if (isReviewRequirementError(err)) {
      const raced = await loadIdempotentPost(db, messageId, player.id);
      return raced ? { ok: true, messageId, body: raced } : reviewRequiredFailure();
    }
    console.error("[post]", err);
    const cap = parseDailyCapCheckError(err);
    if (cap) return cap;
    if (isUniqueConstraintError(err)) {
      const raced = await loadIdempotentPost(db, messageId, player.id);
      if (raced) {
        return { ok: true, messageId, body: raced };
      }
    }
    return {
      ok: false,
      status: 503,
      error: "We could not save your message right now. Please try again.",
    };
  }

  const body = buildModerationApiBody(result, text);
  return { ok: true, messageId, body };
}
