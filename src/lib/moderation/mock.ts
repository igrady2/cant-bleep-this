import type { CategoryId } from "./categories";

/**
 * LOCAL MOCK — NOT TypeSafe/Jev.
 * Keyword heuristics used only when TYPESAFE_API_KEY is unset (or
 * MODERATION_PROVIDER=mock) so the demo runs offline. It returns fake
 * probabilities in the same shape as Jev's Noul answers. Do not rely on it
 * for real moderation.
 */

const HIT = 0.93;
const MISS = 0.03;

const PATTERNS: Record<CategoryId, RegExp[]> = {
  bullying_harassment: [
    /\b(you('| a)?re|ur|u r|is|he'?s|she'?s|they'?re) (so )?(stupid|dumb|ugly|fat|loser|idiot|worthless|pathetic|weird|gross)\b/i,
    /\b(nobody|no one) (likes|wants|cares about) (you|u|him|her|them)\b/i,
    /\b(shut up|go away|you don'?t belong|sit somewhere else|loser|idiot|moron)\b/i,
    /\beveryone (should )?(ignore|hate)s?\b/i,
  ],
  hate_speech: [
    /\b(all|those|these) (\w+ )?(people|immigrants|muslims|jews|christians|gays|girls|boys) (are|should)\b/i,
    /\bgo back to (your|ur) (own )?country\b/i,
    /\b(retard(ed)?|tranny|f[a@]g)\b/i,
  ],
  sexual_content: [
    /\b(sexy|sex|nudes?|naked|horny|hook ?up|send (me )?(a )?pics?)\b/i,
  ],
  violence_threats: [
    /\b(i('| a)?m going to|i'?ll|gonna|i will|i wanna) (kill|hurt|beat|punch|stab|shoot|fight)\b/i,
    /\b(bring(ing)? a (gun|knife|weapon)|bomb|shoot up)\b/i,
    /\bwatch your back\b/i,
  ],
  self_harm: [
    /\b(kill myself|end it all|want to die|wanna die|hurt myself|cut myself|suicid(e|al)|kms)\b/i,
    /\b(go )?kill yourself\b|\bkys\b/i,
  ],
  profanity: [
    /\b(f+u+c+k+\w*|f[\*#@]+c?k\w*|sh[i1!\*]t\w*|b[i1!\*]tch\w*|a+ss+hole|damn it|wtf|stfu|crap|bastard|d[i1]ck)\b/i,
  ],
  personal_info: [
    /\b\d{3}[-.\s)]*\d{3}[-.\s]*\d{4}\b/,
    /\b[\w.+-]+@[\w-]+\.[\w.]+\b/,
    /\b\d{1,5} [a-z0-9 ]{2,30} (street|st|avenue|ave|road|rd|lane|ln|drive|dr|blvd|court|ct)\b/i,
    /\b(my|her|his) (password|passcode|home address|phone number) is\b/i,
    /\b(snap(chat)?|insta(gram)?|tiktok|discord)\s*(is|:|@)/i,
  ],
  spam: [
    /(.)\1{9,}/,
    /\b(\w+)\b(?:\W+\1\b){4,}/i,
    /\b(forward|send) this to \d+\b/i,
    /\bhttps?:\/\/\S+|\bwww\.\S+|\b\w+\.(com|net|org|io|gg|ly)\b/i,
    /\b(buy|selling|for sale|discount code|promo code|dm me to buy|venmo me|cash ?app)\b/i,
  ],
  impersonation: [
    /\b(i'?m|i am|this is) (actually |really )?the real \w+\b/i,
    /\b(i'?m|i am) (actually )?(an? )?(admin|moderator|mod)\b/i,
  ],
};

export function scoreWithMock(message: string): Record<CategoryId, number> {
  const scores = {} as Record<CategoryId, number>;
  for (const [id, patterns] of Object.entries(PATTERNS) as [CategoryId, RegExp[]][]) {
    scores[id] = patterns.some((p) => p.test(message)) ? HIT : MISS;
  }
  return scores;
}
