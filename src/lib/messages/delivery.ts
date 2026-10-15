import "server-only";

import type { FilterOutcome } from "@/lib/moderation/types";
import {
  mayAppearInFeed,
  mayEnterReviewQueue,
  mayEnterTestCase,
  type MessageStatus,
} from "./disposition";

export interface MessageDeliveryFields {
  filterOutcome: FilterOutcome;
  status: MessageStatus;
}

/** Feed queries and serializers should keep only rows the PRD allows in the room. */
export function filterMessagesForFeed<T extends MessageDeliveryFields>(messages: readonly T[]): T[] {
  return messages.filter((message) => mayAppearInFeed(message.filterOutcome, message.status));
}

/** Review queue assignment (#15) must call this when loading candidates. */
export function filterMessagesForReviewQueue<T extends MessageDeliveryFields>(
  messages: readonly T[],
): T[] {
  return messages.filter((message) => mayEnterReviewQueue(message.filterOutcome, message.status));
}

/** Verdict export (#22) must call this before building a permanent test case. */
export function filterMessagesForTestCase<T extends MessageDeliveryFields>(
  messages: readonly T[],
): T[] {
  return messages.filter((message) => mayEnterTestCase(message.filterOutcome, message.status));
}
