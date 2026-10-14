import "server-only";

/** Minimum digits in a contact-like run. Invalid configuration fails closed. */
function minimumDigits(): number {
  const value = process.env.MASK_MIN_DIGITS ?? "7";
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error("MASK_MIN_DIGITS must be a positive integer.");
  }
  return Number(value);
}

export function maskPersonalInformation(text: string): string {
  const minimum = minimumDigits();
  return text
    .replace(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi, "[redacted]")
    // Parentheses may surround a group as in (787) 555-1234. Only the
    // decided separators are consumed; commas and newlines break a run.
    .replace(/\+?\(?\d(?:(?:[.()-]| (?! ))*\d)*\)?/g, (run) =>
      (run.match(/\d/g)?.length ?? 0) >= minimum ? "[redacted]" : run,
    );
}

export interface MessageText {
  username: string;
  text: string;
  /** Present only once players have confirmed a slip; never a client flag. */
  slipRule?: string;
}

export interface MessagePresentation extends MessageText {
  context: readonly MessageText[];
  reasons: readonly string[];
}

function presentText(message: MessageText, publicView: boolean): MessageText {
  return {
    username: maskPersonalInformation(message.username),
    text: publicView && message.slipRule !== undefined
      ? "█████"
      : maskPersonalInformation(message.text),
    ...(message.slipRule === undefined ? {} : { slipRule: maskPersonalInformation(message.slipRule) }),
  };
}

function presentMessage(message: MessagePresentation, publicView: boolean): MessagePresentation {
  // Explicit projection: extra storage fields (including raw text) never leak.
  return {
    ...presentText(message, publicView),
    context: message.context.map((entry) => presentText(entry, publicView)),
    reasons: message.reasons.map(maskPersonalInformation),
  };
}

/** Public slips are fully censored, including slips in their context. */
export function serializePublicMessage(message: MessagePresentation): MessagePresentation {
  return presentMessage(message, true);
}

/** Reviewers retain policy-violating words, but never contact details. */
export function serializeReviewerMessage(message: MessagePresentation): MessagePresentation {
  return presentMessage(message, false);
}

/** The permanent dataset boundary must re-mask, never trust stored masked text. */
export function serializeTestCase(message: MessagePresentation): MessagePresentation {
  return presentMessage(message, false);
}
