import type { SelfHarmCrisisNote } from "@/lib/content/self-harm-crisis-note";

/**
 * Post (`/api/post`) and moderate (`/api/moderate`) JSON may include this field for the author only.
 * Room feed serializers must not surface it; future posting UIs can call `crisisNoteFromAuthorResponse`.
 */
export type AuthorModerationResponse = {
  crisisNote?: SelfHarmCrisisNote;
};

export function crisisNoteFromAuthorResponse(
  data: AuthorModerationResponse | null | undefined,
): SelfHarmCrisisNote | null {
  return data?.crisisNote ?? null;
}
