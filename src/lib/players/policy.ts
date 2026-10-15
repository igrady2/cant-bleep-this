const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

const RESERVED_RAW = [
  "admin",
  "administrator",
  "cantbleepthis",
  "cant_bleep_this",
  "cloudflare",
  "filter",
  "indigo",
  "indigogrady",
  "jev",
  "mod",
  "moderator",
  "official",
  "staff",
  "support",
  "system",
  "typesafe",
  "typesafeai",
] as const;

const BLOCKED_RAW = [
  "anal",
  "anus",
  "arse",
  "ass",
  "asshole",
  "bastard",
  "bitch",
  "blowjob",
  "bollock",
  "boner",
  "boob",
  "butt",
  "clit",
  "cock",
  "coon",
  "crap",
  "cum",
  "cunt",
  "dick",
  "dildo",
  "dyke",
  "fag",
  "fuck",
  "handjob",
  "hitler",
  "horny",
  "jizz",
  "kike",
  "milf",
  "nazi",
  "nigger",
  "nude",
  "penis",
  "piss",
  "porn",
  "pussy",
  "rape",
  "retard",
  "scrotum",
  "sex",
  "shit",
  "slut",
  "spic",
  "tit",
  "tits",
  "twat",
  "vagina",
  "wank",
  "whore",
] as const;

function normalizeSegment(segment: string): string {
  let normalized = segment.toLowerCase().replace(/rn/g, "m");
  normalized = normalized.replace(/1/g, "i").replace(/0/g, "o").replace(/5/g, "s");
  if (normalized.startsWith("l")) normalized = `i${normalized.slice(1)}`;
  return normalized;
}

/** Fold case and documented lookalikes (PRD usernames section). */
export function normalizeUsername(name: string): string {
  return name.toLowerCase().split("_").map(normalizeSegment).join("_");
}

export function isValidUsernameFormat(name: string): boolean {
  return USERNAME_PATTERN.test(name);
}

const RESERVED_NORMALIZED = new Set(RESERVED_RAW.map((entry) => normalizeUsername(entry)));
const BLOCKED_NORMALIZED = new Set(BLOCKED_RAW.map((entry) => normalizeUsername(entry)));

function matchesNormalizedSet(name: string, entries: Set<string>): boolean {
  const normalized = normalizeUsername(name);
  if (entries.has(normalized)) return true;
  return normalized.split("_").some((segment) => segment && entries.has(segment));
}

export function isReservedUsername(name: string): boolean {
  return matchesNormalizedSet(name, RESERVED_NORMALIZED);
}

export function isBlockedWordUsername(name: string): boolean {
  return matchesNormalizedSet(name, BLOCKED_NORMALIZED);
}
