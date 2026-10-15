import "server-only";

function readFraction(envName: string, defaultValue: number): number {
  const parsed = Number(process.env[envName]);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return defaultValue;
  return parsed;
}

/** Share of non-seed queue picks that target the most uncertain messages (0–1). */
export function queueUncertainFraction(): number {
  return readFraction("REVIEW_QUEUE_UNCERTAIN_FRACTION", 0.5);
}

/** Probability that a queue assignment is a known-answer seed check (0–1). */
export function queueSeedFraction(): number {
  return readFraction("REVIEW_QUEUE_SEED_FRACTION", 0.1);
}

/** Maximum pending messages considered when building the queue (bounded scan). */
export function queueScanLimit(): number {
  const parsed = Number(process.env.REVIEW_QUEUE_SCAN_LIMIT);
  if (!Number.isFinite(parsed) || parsed < 1) return 500;
  return Math.min(Math.floor(parsed), 2000);
}

/** Seconds before an unconsumed assignment expires and releases its hand-picked slot. */
export function assignmentTtlSeconds(): number {
  const parsed = Number(process.env.REVIEW_ASSIGNMENT_TTL_SECONDS);
  if (!Number.isFinite(parsed) || parsed < 60) return 900;
  return Math.min(Math.floor(parsed), 86_400);
}

export function randomUnit(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] / (0xffffffff + 1);
}

export function pickRandom<T>(items: readonly T[]): T | null {
  if (items.length === 0) return null;
  const index = Math.floor(randomUnit() * items.length);
  return items[index] ?? items[0];
}
