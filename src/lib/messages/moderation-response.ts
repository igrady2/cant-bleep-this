import "server-only";

import type { SelfHarmCrisisNote } from "@/lib/content/self-harm-crisis-note";
import type { ModerationResult } from "@/lib/moderation/types";
import { selfHarmCrisisNoteForScores } from "@/lib/moderation/self-harm-crisis";
import { maskPersonalInformation } from "@/lib/presentation";
import {
  dispositionFromModeration,
  mayAppearInFeed,
  mayEnterReviewQueue,
  type MessageStatus,
} from "./disposition";

/** Player-visible API body after a successful moderation check. */
export type ModerationApiBody =
  | {
      outcome: "off_limits";
      allowed: false;
      provider: ModerationResult["provider"];
      crisisNote?: SelfHarmCrisisNote;
    }
  | (ModerationResult & {
      message: string;
      filterOutcome: "passed" | "blocked";
      status: MessageStatus;
      crisisNote?: SelfHarmCrisisNote;
    });

export function buildModerationApiBody(
  result: ModerationResult,
  rawText: string,
): ModerationApiBody {
  const maskedText = maskPersonalInformation(rawText);
  const disposition = dispositionFromModeration(result, rawText, maskedText);
  const crisisNote = selfHarmCrisisNoteForScores(result.scores);

  if (disposition.filterOutcome === "off_limits") {
    return {
      outcome: "off_limits",
      allowed: false,
      provider: result.provider,
      ...(crisisNote ? { crisisNote } : {}),
    };
  }

  if (
    disposition.filterOutcome === "passed"
    && !mayAppearInFeed(disposition.filterOutcome, disposition.status)
  ) {
    throw new Error("Moderation produced a pass outcome that cannot appear in the feed.");
  }
  if (!mayEnterReviewQueue(disposition.filterOutcome, disposition.status)) {
    throw new Error("Moderation produced an outcome that cannot enter the review queue.");
  }

  return {
    ...result,
    filterOutcome: disposition.filterOutcome,
    status: disposition.status,
    message: disposition.maskedText!,
    model: maskPersonalInformation(result.model),
    flags: result.flags.map((flag) => ({
      ...flag,
      label: maskPersonalInformation(flag.label),
      explanation: maskPersonalInformation(flag.explanation),
    })),
    ...(crisisNote ? { crisisNote } : {}),
  };
}
