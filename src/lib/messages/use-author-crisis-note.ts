"use client";

import { useCallback, useState } from "react";

import type { SelfHarmCrisisNote } from "@/lib/content/self-harm-crisis-note";
import {
  crisisNoteFromAuthorResponse,
  type AuthorModerationResponse,
} from "./author-crisis-note";

/** Keeps the author-only 988 note in sync with a post/moderate API response. */
export function useAuthorCrisisNote() {
  const [crisisNote, setCrisisNote] = useState<SelfHarmCrisisNote | null>(null);

  const applyAuthorResponse = useCallback((data: AuthorModerationResponse | null | undefined) => {
    setCrisisNote(crisisNoteFromAuthorResponse(data));
  }, []);

  const clearCrisisNote = useCallback(() => setCrisisNote(null), []);

  const resetCrisisNoteForPostAttempt = useCallback(() => {
    setCrisisNote(null);
  }, []);

  return {
    crisisNote,
    applyAuthorResponse,
    clearCrisisNote,
    resetCrisisNoteForPostAttempt,
  };
}
