import "server-only";

import type { ModerationResult } from "./types";
import {
  SELF_HARM_CRISIS_NOTE,
  type SelfHarmCrisisNote,
} from "@/lib/content/self-harm-crisis-note";
import { selfHarmThreshold } from "./thresholds";

export function shouldShowSelfHarmCrisisNote(
  scores: ModerationResult["scores"],
): boolean {
  return scores.self_harm >= selfHarmThreshold();
}

export function selfHarmCrisisNoteForScores(
  scores: ModerationResult["scores"],
): SelfHarmCrisisNote | undefined {
  return shouldShowSelfHarmCrisisNote(scores)
    ? SELF_HARM_CRISIS_NOTE
    : undefined;
}
