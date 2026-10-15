const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

const RESERVED_RAW = (
  "admin,administrator,cantbleepthis,cant_bleep_this,cloudflare,filter,indigo,indigogrady,jev,mod,moderator,official,staff,support,system,typesafe,typesafeai"
).split(",");

const BLOCKED_RAW = (
  "anal,anus,arse,ass,asshole,bastard,bitch,blowjob,bollock,boner,boob,butt,clit,cock,coon,crap,cum,cunt,dick,dildo,dyke,fag,fuck,handjob,hitler,horny,jizz,kike,milf,nazi,nigger,nude,penis,piss,porn,pussy,rape,retard,scrotum,sex,shit,slut,spic,tit,tits,twat,vagina,wank,whore"
).split(",");

function normalizeSegment(segment: string): string {
  return segment
    .toLowerCase()
    .replace(/rn/g, "m")
    .replace(/[1l]/g, "i")
    .replace(/0/g, "o")
    .replace(/5/g, "s");
}

export function normalizeUsername(name: string): string {
  return name.toLowerCase().split("_").map(normalizeSegment).join("_");
}

export function isValidUsernameFormat(name: string): boolean {
  return USERNAME_PATTERN.test(name);
}

const RESERVED_NORMALIZED = RESERVED_RAW.map((entry) => normalizeUsername(entry));
const BLOCKED_NORMALIZED = BLOCKED_RAW.map((entry) => normalizeUsername(entry));

const SHORT_RESERVED_MAX_LEN = 3;

export function isReservedUsername(name: string): boolean {
  const normalized = normalizeUsername(name);
  const segments = normalized.split("_");

  for (const reserved of RESERVED_NORMALIZED) {
    if (normalized === reserved) return true;
    if (segments.includes(reserved)) return true;
    if (reserved.length > SHORT_RESERVED_MAX_LEN && normalized.includes(reserved)) return true;
  }
  return false;
}

/** Blocked terms match the whole name or a single underscore segment; joined-up words go to Jev. */
export function isBlockedWordUsername(name: string): boolean {
  const normalized = normalizeUsername(name);
  const segments = normalized.split("_").filter(Boolean);
  return BLOCKED_NORMALIZED.some(
    (blocked) => normalized === blocked || segments.includes(blocked),
  );
}
