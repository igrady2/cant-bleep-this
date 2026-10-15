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
