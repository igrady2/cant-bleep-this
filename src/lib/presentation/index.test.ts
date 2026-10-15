import { afterEach, describe, expect, it, vi } from "vitest";
import {
  censorSlips,
  filterDeliverableContext,
  maskPersonalInformation,
  serializePublicMessage,
  serializeReviewerMessage,
  serializeTestCase,
  UndeliverableMessageError,
  type MessagePresentation,
} from "./index";

// All contact fixtures are synthetic; example.test is reserved for tests.
const localNumber = ["555", "0100"].join("-");
const fullNumber = `(${"787"}) ${localNumber}`;
const email = ["player", "example.test"].join("@");
const message: MessagePresentation = {
  username: "Player A",
  text: `You are stupid. Call ${fullNumber}`,
  slipRule: "Harassment",
  filterOutcome: "passed",
  status: "pending",
  context: [{
    username: "Player B",
    text: `Email ${email}`,
    filterOutcome: "passed",
    status: "pending",
  }],
  reasons: [`Insult followed by ${localNumber}`],
};

afterEach(() => vi.unstubAllEnvs());

describe("contact masking", () => {
  it.each([
    localNumber,
    fullNumber,
    `+1 787 ${localNumber.replace("-", " ")}`,
    localNumber.replace("-", "."),
    "1234567",
    "1 2 3 4 5 6 7",
    email,
    ["Player.Name+tag", "EXAMPLE.TEST"].join("@"),
  ])("masks synthetic contact case %#", (contact) => {
    expect(maskPersonalInformation(`Before ${contact} after`)).toBe("Before [redacted] after");
  });

  it("preserves short runs, ordinary words, and separators outside the decision", () => {
    const text = "Round 123456; 123  4567; 123\n4567; 123,4567. Hello!";
    expect(maskPersonalInformation(text)).toBe(text);
  });

  it("masks multiple contacts and is idempotent", () => {
    const masked = maskPersonalInformation(`${localNumber}, ${email}, ${fullNumber}`);
    expect(masked).toBe("[redacted], [redacted], [redacted]");
    expect(maskPersonalInformation(masked)).toBe(masked);
  });

  it("uses the configured minimum", () => {
    vi.stubEnv("MASK_MIN_DIGITS", "6");
    expect(maskPersonalInformation("123456")).toBe("[redacted]");
    vi.stubEnv("MASK_MIN_DIGITS", "8");
    expect(maskPersonalInformation(localNumber)).toBe(localNumber);
    expect(maskPersonalInformation(fullNumber)).toBe("[redacted]");
  });

  it.each(["0", "-1", "7.5", "", "garbage", "9007199254740992"])(
    "rejects invalid configuration %# rather than releasing raw text",
    (value) => {
      vi.stubEnv("MASK_MIN_DIGITS", value);
      expect(() => maskPersonalInformation(localNumber)).toThrow("MASK_MIN_DIGITS");
    },
  );
});

describe("presentation boundaries", () => {
  it.each([serializePublicMessage, serializeReviewerMessage, serializeTestCase])(
    "masks text, context, reasons and metadata without retaining extra raw fields (%#)",
    (serialize) => {
      const input = {
        ...message,
        username: email,
        slipRule: `Harassment ${localNumber}`,
        rawText: fullNumber,
        context: [{
          username: email,
          text: fullNumber,
          rawText: email,
          filterOutcome: "passed",
          status: "pending",
        }],
      };
      const output = serialize(input as MessagePresentation);
      const json = JSON.stringify(output);
      for (const contact of [email, localNumber, fullNumber]) expect(json).not.toContain(contact);
      expect(json).not.toContain("rawText");
      expect(output.reasons).toEqual(["Insult followed by [redacted]"]);
      expect(output.context).toEqual([{
        username: "[redacted]",
        text: "[redacted]",
        filterOutcome: "passed",
        status: "pending",
      }]);
      expect(input.rawText).toBe(fullNumber);
    },
  );

  it("censors public slips while preserving masked violations for reviewers and the dataset", () => {
    const input = { ...message, context: [{ ...message }] };
    const publicMessage = serializePublicMessage(input);
    expect(publicMessage.text).toBe("Y** *r* st*p*d. C*ll [redacted]");
    expect(publicMessage.slipRule).toBe("Harassment");
    expect(publicMessage.context[0].text).toBe("Y** *r* st*p*d. C*ll [redacted]");
    for (const serialize of [serializeReviewerMessage, serializeTestCase]) {
      expect(serialize(input).text).toBe("You are stupid. Call [redacted]");
      expect(serialize(input).context[0].text).toBe(serialize === serializeReviewerMessage
        ? "Y** *r* st*p*d. C*ll [redacted]" : "You are stupid. Call [redacted]");
    }
  });

  it("does not censor unconfirmed messages", () => {
    expect(serializePublicMessage({ ...message, slipRule: undefined }).text)
      .toBe("You are stupid. Call [redacted]");
  });

  it("drops off-limits and excluded predecessors from serialized context", () => {
    const input: MessagePresentation = {
      ...message,
      context: [
        { username: "Player B", text: "visible", filterOutcome: "passed", status: "pending" },
        { username: "Player C", text: "hidden", filterOutcome: "off_limits", status: "excluded" },
      ],
    };
    const withIncompleteContext = {
      ...input,
      context: [...input.context, { username: "Player D", text: "no metadata" }],
    };
    const output = serializeReviewerMessage(input);
    expect(output.context).toEqual([{
      username: "Player B",
      text: "visible",
      filterOutcome: "passed",
      status: "pending",
    }]);
    expect(filterDeliverableContext(withIncompleteContext.context)).toHaveLength(1);
  });

  it("refuses to serialize off-limits rows", () => {
    const input = { ...message, filterOutcome: "off_limits" as const, status: "excluded" as const };
    for (const serialize of [serializePublicMessage, serializeReviewerMessage, serializeTestCase]) {
      expect(() => serialize(input)).toThrow(UndeliverableMessageError);
    }
  });

  it("re-masks permanent test-case output instead of trusting stored masked fields", () => {
    const input = { ...message, maskedText: email, rawText: fullNumber };
    const output = serializeTestCase(input);
    expect(output.text).toBe("You are stupid. Call [redacted]");
    expect(Object.keys(output).sort()).toEqual([
      "context", "filterOutcome", "reasons", "slipRule", "status", "text", "username",
    ]);
    expect(serializeTestCase(output)).toEqual(output);
  });
});


describe("span censorship", () => {
  it.each([
    ["fuck", "f*ck"], ["AEIOU y", "***** y"], ["cry", "c*y"],
    ["z", "*"], ["hh", "h*"], ["shh", "s*h"], ["shhh", "sh*h"],
  ])("masks %s as %s", (text, expected) => {
    expect(censorSlips(text, [{ start: 0, end: text.length }])).toBe(expected);
  });

  it("merges overlapping consonant spans before choosing one middle character", () => {
    expect(censorSlips("shhh", [{ start: 0, end: 3 }, { start: 1, end: 4 }])).toBe("sh*h");
  });

  it("keeps adjacent consonant spans separate", () => {
    expect(censorSlips("hhhh", [{ start: 0, end: 2 }, { start: 2, end: 4 }])).toBe("h*h*");
  });

  it("only masks marked occurrences and strips internal span data", () => {
    const input = { ...message, text: "fuck this fuck", slipSpans: [{ start: 0, end: 4 }] };
    expect(serializePublicMessage(input).text).toBe("f*ck this fuck");
    expect(serializePublicMessage(input)).not.toHaveProperty("slipSpans");
    expect(serializeReviewerMessage(input).text).toBe(input.text);
  });

  it("uses contact-masked offsets without altering redactions, even inside a span", () => {
    const text = `${email} fuck`;
    expect(censorSlips(text, [{ start: 11, end: 15 }])).toBe("[redacted] f*ck");
    expect(censorSlips(text)).toBe("[redacted] f*ck");
  });

  it("uses each context slip's own spans even on judging paths", () => {
    const input = { ...message, slipRule: undefined, context: [{
      ...message, text: "fuck this fuck", slipSpans: [{ start: 10, end: 14 }],
    }] };
    for (const serialize of [serializePublicMessage, serializeReviewerMessage]) {
      expect(serialize(input).context[0].text).toBe("fuck this f*ck");
    }
  });
});


it.each([
  ["\u{1F600}", "*"],
  ["\u{1F600}\u{1F601}", "\u{1F600}*"],
  ["\u{1F600}\u{1F601}\u{1F602}", "\u{1F600}*\u{1F602}"],
  ["\u{1F600}\u{1F601}\u{1F602}\u{1F603}", "\u{1F600}\u{1F601}*\u{1F603}"],
])("masks the middle code point of %s without breaking emoji", (text, expected) => {
  expect(censorSlips(text, [{ start: 0, end: text.length }])).toBe(expected);
});

it("falls back to whole-message censorship for invalid stored spans", () => {
  expect(censorSlips("fuck this fuck", [{ start: 0, end: 4 }, { start: 99, end: 100 }]))
    .toBe("f*ck th*s f*ck");
});
