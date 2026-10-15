import "server-only";

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

/** Threshold for the `self_harm` rule and the author-only 988 crisis note. */
export function selfHarmThreshold(): number {
  return readThreshold("MODERATION_THRESHOLD_SELF_HARM");
}
