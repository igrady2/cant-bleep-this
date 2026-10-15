import "server-only";

import { OFF_LIMITS_ID } from "./off-limits";

const DEFAULT_THRESHOLD = 0.5;

function readThreshold(envName: string): number {
  const parsed = Number(process.env[envName]);
  return Number.isFinite(parsed) && parsed > 0 && parsed < 1 ? parsed : DEFAULT_THRESHOLD;
}

/** Probability at or above which a reviewable rule blocks a message. */
export function reviewableThreshold(): number {
  return readThreshold("MODERATION_THRESHOLD");
}

/** Independent threshold for the off-limits exclusion question. */
export function offLimitsThreshold(): number {
  return readThreshold("MODERATION_THRESHOLD_OFF_LIMITS");
}

export const REVIEWABLE_THRESHOLD_ENV: Record<string, string> = {
  bullying_harassment: "MODERATION_THRESHOLD_BULLYING_HARASSMENT",
  hate_speech: "MODERATION_THRESHOLD_HATE_SPEECH",
  sexual_content: "MODERATION_THRESHOLD_SEXUAL_CONTENT",
  violence_threats: "MODERATION_THRESHOLD_VIOLENCE_THREATS",
  self_harm: "MODERATION_THRESHOLD_SELF_HARM",
  profanity: "MODERATION_THRESHOLD_PROFANITY",
  personal_info: "MODERATION_THRESHOLD_PERSONAL_INFO",
  spam: "MODERATION_THRESHOLD_SPAM",
  impersonation: "MODERATION_THRESHOLD_IMPERSONATION",
};

export function thresholdEnvNameForRule(ruleId: string): string | undefined {
  if (ruleId === OFF_LIMITS_ID) return "MODERATION_THRESHOLD_OFF_LIMITS";
  return REVIEWABLE_THRESHOLD_ENV[ruleId];
}
