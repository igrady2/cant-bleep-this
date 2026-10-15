import { CATEGORIES, POLICY_VERSION } from "@/lib/moderation/categories";

/** Player-facing Terms of Use content derived from docs/CONTENT_RULES.md (#2). */
export const TERMS_INTRO =
  "Can't Bleep This is a casual public chat game. Messages are checked by an automated filter and reviewed by players. These rules describe what is not allowed in the room.";

export const OFF_LIMITS_POLICY = {
  title: "Off-limits content (never shown)",
  body:
    "Credible threats of serious harm aimed at a real person, place, or event—stated as intent or a plan without clear joke, game, or fiction framing—and any sexual content involving minors are removed on sight. They are never posted, never shown to reviewers, and never enter the chat feed.",
};

export const REVIEW_RULES = CATEGORIES.map((category) => ({
  id: category.id,
  label: category.label,
  summary: category.explanation,
}));

export { POLICY_VERSION };
