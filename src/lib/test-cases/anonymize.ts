import { normalizeUsername } from "@/lib/players/policy";

/** Username characters; a token is a maximal run of them. */
const TOKEN = /[A-Za-z0-9_]+/g;

/** Player A ... Player Z, then Player AA, Player AB, ... */
export function standInName(index: number): string {
  let label = "";
  for (let n = index; n >= 0; n = Math.floor(n / 26) - 1) {
    label = String.fromCharCode(65 + (n % 26)) + label;
  }
  return `Player ${label}`;
}

/** Every token a username could be, in normalized form, for the mention lookup. */
export function candidateUsernames(texts: readonly string[]): string[] {
  const candidates = new Set<string>();
  for (const text of texts) {
    for (const [token] of text.matchAll(TOKEN)) {
      if (token.length >= 3 && token.length <= 20) candidates.add(normalizeUsername(token));
    }
  }
  return [...candidates];
}

/**
 * Replaces known usernames with neutral stand-ins, one per player per case.
 * Matching uses the claim normalization, so look-alike spellings of a name
 * ("A1ex" for "Alex") get the same stand-in. Stand-ins are assigned in the
 * order names are first seen, so feed text in reading order.
 */
export class Anonymizer {
  private readonly standIns = new Map<string, string>();

  constructor(private readonly knownNames: ReadonlySet<string>) {}

  /** Stand-in for a username, assigning the next one on first sight. */
  username(name: string): string {
    const key = normalizeUsername(name);
    let standIn = this.standIns.get(key);
    if (!standIn) {
      standIn = standInName(this.standIns.size);
      this.standIns.set(key, standIn);
    }
    return standIn;
  }

  /** One pass over the original text, so a stand-in is never re-matched. */
  text(text: string): string {
    return text.replace(TOKEN, (token) =>
      this.knownNames.has(normalizeUsername(token)) ? this.username(token) : token,
    );
  }
}
