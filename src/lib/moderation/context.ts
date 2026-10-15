import "server-only";

/** One preceding chat line supplied by the server (oldest first). */
export interface ModerationContextLine {
  username: string;
  text: string;
}

export interface ModerationRoomContext {
  /** Up to 10 preceding messages, oldest first. */
  context: ModerationContextLine[];
  /** Usernames currently in the room (may be empty when unknown). */
  roomUsernames: string[];
}

export const MAX_CONTEXT_LINES = 10;

export type ModerationContextParseResult =
  | { ok: true; roomContext: ModerationRoomContext }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseContextLine(value: unknown, index: number): ModerationContextLine | string {
  if (!isRecord(value)) {
    return `context[${index}] must be an object with username and text.`;
  }
  const username = typeof value.username === "string" ? value.username.trim() : "";
  const text = typeof value.text === "string" ? value.text.trim() : "";
  if (!username || !text) {
    return `context[${index}] needs a non-empty username and text.`;
  }
  return { username, text };
}

/**
 * Normalizes server context for Jev: trims fields, keeps only the last 10 lines,
 * and drops blank room usernames.
 */
export function normalizeRoomContext(
  context: readonly ModerationContextLine[],
  roomUsernames: readonly string[],
): ModerationRoomContext {
  const lines = context
    .map((line) => ({
      username: line.username.trim(),
      text: line.text.trim(),
    }))
    .filter((line) => line.username && line.text);
  const trimmedRoom = roomUsernames.map((name) => name.trim()).filter(Boolean);
  const capped =
    lines.length > MAX_CONTEXT_LINES ? lines.slice(-MAX_CONTEXT_LINES) : lines;
  return { context: capped, roomUsernames: trimmedRoom };
}

/** Parses optional `context` and `roomUsernames` from a moderation API payload. */
export function parseModerationRoomContext(payload: unknown): ModerationContextParseResult {
  const body = isRecord(payload) ? payload : {};

  const context: ModerationContextLine[] = [];
  if (body.context !== undefined) {
    if (!Array.isArray(body.context)) {
      return { ok: false, error: "context must be an array of { username, text } objects." };
    }
    if (body.context.length > MAX_CONTEXT_LINES) {
      return {
        ok: false,
        error: `context can include at most ${MAX_CONTEXT_LINES} preceding messages.`,
      };
    }
    for (let i = 0; i < body.context.length; i++) {
      const parsed = parseContextLine(body.context[i], i);
      if (typeof parsed === "string") return { ok: false, error: parsed };
      context.push(parsed);
    }
  }

  const roomUsernames: string[] = [];
  if (body.roomUsernames !== undefined) {
    if (!Array.isArray(body.roomUsernames)) {
      return { ok: false, error: "roomUsernames must be an array of strings." };
    }
    for (let i = 0; i < body.roomUsernames.length; i++) {
      const name = body.roomUsernames[i];
      if (typeof name !== "string" || !name.trim()) {
        return { ok: false, error: `roomUsernames[${i}] must be a non-empty string.` };
      }
      roomUsernames.push(name.trim());
    }
  }

  return { ok: true, roomContext: normalizeRoomContext(context, roomUsernames) };
}
