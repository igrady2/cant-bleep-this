import "server-only";

const warned = new Set<string>();
function warnInvalid(name: string) {
  if (process.env[name] === undefined || warned.has(name)) return;
  warned.add(name);
  console.warn(`[reviews.settings] Invalid ${name}; using default.`);
}

export function seedStandingWindow(): number {
  return readInteger("REVIEW_SEED_WINDOW", 10, 1, 1000);
}
export function seedStandingMisses(): number {
  return readInteger("REVIEW_SEED_MISSES", 3, 1, 1000);
}
function readInteger(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const n = Number(raw);
  if (raw === undefined) return fallback;
  if (!raw?.trim() || !Number.isSafeInteger(n) || n < min || n > max) {
    warnInvalid(name);
    return fallback;
  }
  return n;
}

export interface ReviewRequirementTier { queueSize: number; posts: number }

/** Runtime env override, editable in Worker settings without a code release. */
export function reviewRequirementTiers(): ReviewRequirementTier[] {
  const defaults = [
    { queueSize: 10, posts: 5 },
    { queueSize: 50, posts: 3 },
    { queueSize: 200, posts: 1 },
  ];
  try {
    const value: unknown = JSON.parse(process.env.REVIEW_REQUIREMENT_TIERS ?? "null");
    if (!Array.isArray(value) || value.length === 0 || !value.every((tier, i) =>
      tier && Number.isSafeInteger(tier.queueSize) && tier.queueSize >= 0 &&
      Number.isSafeInteger(tier.posts) && tier.posts > 0 &&
      (i === 0 || tier.queueSize > value[i - 1].queueSize),
    )) { warnInvalid("REVIEW_REQUIREMENT_TIERS"); return defaults; }
    return value;
  } catch {
    warnInvalid("REVIEW_REQUIREMENT_TIERS");
    return defaults;
  }
}

function readFraction(envName: string, defaultValue: number): number {
  if (process.env[envName] === undefined) return defaultValue;
  const parsed = process.env[envName]?.trim() ? Number(process.env[envName]) : NaN;
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) { warnInvalid(envName); return defaultValue; }
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
  return readInteger("REVIEW_QUEUE_SCAN_LIMIT", 500, 1, 2000);
}

/** Seconds before an unconsumed assignment expires and releases its hand-picked slot. */
export function assignmentTtlSeconds(): number {
  return readInteger("REVIEW_ASSIGNMENT_TTL_SECONDS", 900, 60, 86400);
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
