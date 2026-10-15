import "server-only";

/** UTF-16 offsets into the PII-masked serializeReviewerMessage text.
 * Start inclusive, end exclusive; never offsets into raw storage text. */
export interface FlaggedSpan {
  start: number;
  end: number;
}

export type SpanParseResult =
  | { ok: true; spans: FlaggedSpan[] }
  | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Accepts only `{ start, end }` objects (or `[start, end]` pairs). Rejects bare
 * word strings and any span outside `[0, messageLength)` or inverted/empty.
 */
export function parseAndValidateFlaggedSpans(
  raw: unknown,
  messageLength: number,
): SpanParseResult {
  if (raw === undefined || raw === null) {
    return { ok: true, spans: [] };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: "Flagged spans must be a list of character ranges." };
  }
  if (raw.length > 140) {
    return { ok: false, error: "Flag at most 140 spans per review." };
  }
  if (raw.length === 0) {
    return { ok: true, spans: [] };
  }

  const spans: FlaggedSpan[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      return {
        ok: false,
        error: "Flag a span by its character range, not by the word text.",
      };
    }

    let start: unknown;
    let end: unknown;
    if (Array.isArray(entry) && entry.length === 2) {
      [start, end] = entry;
    } else if (isPlainObject(entry)) {
      if (Object.keys(entry).some((key) => key !== "start" && key !== "end")) {
        return {
          ok: false,
          error: "Each flagged span must contain only start and end offsets.",
        };
      }
      start = entry.start;
      end = entry.end;
    } else {
      return { ok: false, error: "Each flagged span must be a start and end offset." };
    }

    if (
      typeof start !== "number" ||
      typeof end !== "number" ||
      !Number.isInteger(start) ||
      !Number.isInteger(end)
    ) {
      return { ok: false, error: "Span offsets must be whole numbers." };
    }
    if (start < 0 || end > messageLength || start >= end) {
      return {
        ok: false,
        error: "Each flagged span must fall inside the message and be non-empty.",
      };
    }
    spans.push({ start, end });
  }

  // Canonical union: duplicates and overlapping taps are stored only once.
  spans.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: FlaggedSpan[] = [];
  for (const span of spans) {
    const previous = merged[merged.length - 1];
    if (previous && span.start < previous.end) {
      previous.end = Math.max(previous.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  return { ok: true, spans: merged };
}

export function serializeFlaggedSpans(spans: readonly FlaggedSpan[]): string {
  return JSON.stringify(spans.map((s) => ({ start: s.start, end: s.end })));
}
