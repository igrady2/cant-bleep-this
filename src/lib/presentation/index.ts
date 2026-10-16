import "server-only";

import { parseAndValidateFlaggedSpans, type FlaggedSpan } from "@/lib/reviews/spans";
import type { FilterOutcome } from "@/lib/moderation/types";
import { mayAppearInContext } from "@/lib/messages/disposition";
import type { MessageStatus } from "@/lib/messages/disposition";

/** Minimum digits in a contact-like run. Invalid configuration fails closed. */
function minimumDigits(): number {
  const value = process.env.MASK_MIN_DIGITS ?? "7";
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error("MASK_MIN_DIGITS must be a positive integer.");
  }
  return Number(value);
}

export function maskPersonalInformation(text: string): string {
  const minimum = minimumDigits();
  return text
    .replace(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi, "[redacted]")
    // Parentheses may surround a group as in (787) 555-1234. Only the
    // decided separators are consumed; commas and newlines break a run.
    .replace(/\+?\(?\d(?:(?:[.()-]| (?! ))*\d)*\)?/g, (run) =>
      (run.match(/\d/g)?.length ?? 0) >= minimum ? "[redacted]" : run,
    );
}

export interface MessageText {
  username: string;
  text: string;
  /** Present only once players have confirmed a slip; never a client flag. */
  slipRule?: string;
  /** Internal only: offsets into contact-masked reviewer text. Never serialized. */
  slipSpans?: readonly FlaggedSpan[];
}

export interface DeliverableContextEntry extends MessageText {
  /** Internal provenance for removing a predecessor from saved game cases. */
  sourceMessageId?: string;
  filterOutcome: FilterOutcome;
  status: MessageStatus;
}

export interface MessagePresentation extends MessageText {
  context: readonly DeliverableContextEntry[];
  reasons: readonly string[];
  filterOutcome: FilterOutcome;
  status: MessageStatus;
}

export class UndeliverableMessageError extends Error {
  constructor(message = "Off-limits content cannot be serialized for delivery.") {
    super(message);
    this.name = "UndeliverableMessageError";
  }
}

function assertDeliverable(message: Pick<MessagePresentation, "filterOutcome" | "status">): void {
  if (message.filterOutcome === "off_limits" || message.status === "excluded") {
    throw new UndeliverableMessageError();
  }
}

/** Drops predecessors without delivery metadata or that must not be shown. */
export function filterDeliverableContext(
  context: readonly Partial<DeliverableContextEntry>[],
): DeliverableContextEntry[] {
  return context.filter((entry): entry is DeliverableContextEntry => {
    if (entry.filterOutcome === undefined || entry.status === undefined) return false;
    return mayAppearInContext(entry.filterOutcome, entry.status);
  });
}

/** Apply the union once, preserving contact redactions and occurrence offsets. */
export function censorSlips(text: string, spans: readonly FlaggedSpan[] = []): string {
  const masked = maskPersonalInformation(text);
  const sorted = spans.flatMap((span) => {
    const parsed = parseAndValidateFlaggedSpans([span], masked.length);
    // Stale stored offsets must fail closed for this message, not the feed.
    if (!parsed.ok) return [{ start: 0, end: masked.length }];
    return parsed.spans;
  }).sort((a, b) => a.start - b.start || a.end - b.end);
  const union: FlaggedSpan[] = [];
  for (const span of sorted) {
    const previous = union[union.length - 1];
    if (previous && span.start < previous.end) previous.end = Math.max(previous.end, span.end);
    else union.push({ ...span });
  }
  if (!union.length) union.push({ start: 0, end: masked.length });
  const characters = masked.split("");
  const protectedOffsets = new Set<number>();
  for (const match of masked.matchAll(/\[redacted\]/g)) {
    for (let i = match.index; i < match.index + match[0].length; i++) protectedOffsets.add(i);
  }
  for (const { start, end } of union) {
    const selection = masked.slice(start, end);
    if (/[aeiou]/i.test(selection)) {
      for (let i = start; i < end; i++) {
        if (/[aeiou]/i.test(masked[i]) && !protectedOffsets.has(i)) characters[i] = "*";
      }
    } else if (end > start) {
      const points = Array.from(selection);
      const pointIndex = Math.floor(points.length / 2);
      const middle = start + points.slice(0, pointIndex).join("").length;
      if (!protectedOffsets.has(middle)) {
        characters[middle] = "*";
        for (let i = 1; i < points[pointIndex].length; i++) characters[middle + i] = "";
      }
    }
  }
  return characters.join("");
}

function presentText(message: MessageText, publicView: boolean): MessageText {
  return {
    username: maskPersonalInformation(message.username),
    text: publicView && message.slipRule !== undefined
      ? censorSlips(message.text, message.slipSpans)
      : maskPersonalInformation(message.text),
    ...(message.slipRule === undefined ? {} : { slipRule: maskPersonalInformation(message.slipRule) }),
  };
}

function presentMessage(
  message: MessagePresentation,
  publicView: boolean,
  publicContext = publicView,
): MessagePresentation {
  assertDeliverable(message);
  // Explicit projection: extra storage fields (including raw text) never leak.
  return {
    ...presentText(message, publicView),
    filterOutcome: message.filterOutcome,
    status: message.status,
    context: filterDeliverableContext(message.context).map((entry) => ({
      ...presentText(entry, publicContext),
      filterOutcome: entry.filterOutcome,
      status: entry.status,
    })),
    reasons: message.reasons.map(maskPersonalInformation),
  };
}

/** Public slips are span-censored, including slips in their context. */
export function serializePublicMessage(message: MessagePresentation): MessagePresentation {
  return presentMessage(message, true);
}

/** Reviewers retain policy-violating words, but never contact details. */
export function serializeReviewerMessage(message: MessagePresentation): MessagePresentation {
  return presentMessage(message, false, true);
}

/** The permanent dataset boundary must re-mask, never trust stored masked text. */
export function serializeTestCase(message: MessagePresentation): MessagePresentation {
  return presentMessage(message, false);
}
