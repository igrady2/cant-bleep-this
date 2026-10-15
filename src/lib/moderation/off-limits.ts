import "server-only";

/**
 * The separate exclusion check from docs/CONTENT_RULES.md (policy v1).
 * It is not one of the nine reviewable rules and is never offered to reviewers.
 */
export const OFF_LIMITS_ID = "off_limits" as const;

export const OFF_LIMITS_QUESTION = {
  instructions:
    "Does `message`, understood with the preceding chat and usernames in the room, contain either (1) an off-limits threat or (2) any sexual content involving minors? An off-limits threat is a threat of serious harm (killing, shooting, bombing, assault) aimed at a real target, meaning someone in the room, a named real person, or a real place or event, stated as intent or a plan, with no clear joke, game or fiction framing. Everything else violent goes to the reviewable violence rule: hyperbole (\"I'll kill you if you take my fries\"), fiction, games, song lyrics, and threats with no real target. When it is unclear, lean off-limits. Losing one message for review costs less than showing a real threat. The joke, game and fiction exceptions apply only to threats; any sexual content involving minors remains off-limits.",
  criteria: {
    true:
      "A serious-harm threat meeting the real-target, intent/plan and framing definition above; an unclear threat that should conservatively be treated as off-limits; or any sexual content involving minors.",
    false:
      "Neither branch applies. Clearly framed violent hyperbole, fiction, games, song lyrics and threats with no real target remain reviewable under `violence_threats`; adult-only sexual content remains reviewable under `sexual_content`.",
  },
};
