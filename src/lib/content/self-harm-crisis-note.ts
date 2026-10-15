/** Author-only copy for self-harm–related filter scores. Reword here; do not duplicate in UI. */
export type SelfHarmCrisisNote = {
  /** Short supportive line shown above contact options. */
  message: string;
  /** Display label for the lifeline number (also used for tel/sms). */
  phone: string;
  websiteUrl: string;
  websiteLabel: string;
};

export const SELF_HARM_CRISIS_NOTE: SelfHarmCrisisNote = {
  message:
    "If you or someone you know is struggling, free support is available 24/7.",
  phone: "988",
  websiteUrl: "https://988lifeline.org",
  websiteLabel: "988lifeline.org",
};
