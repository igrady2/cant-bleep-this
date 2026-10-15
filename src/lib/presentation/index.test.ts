import { afterEach, describe, expect, it, vi } from "vitest";
import {
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
  context: [{ username: "Player B", text: `Email ${email}` }],
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
        context: [{ username: email, text: fullNumber, rawText: email }],
      };
      const output = serialize(input);
      const json = JSON.stringify(output);
      for (const contact of [email, localNumber, fullNumber]) expect(json).not.toContain(contact);
      expect(json).not.toContain("rawText");
      expect(output.reasons).toEqual(["Insult followed by [redacted]"]);
      expect(output.context).toEqual([{ username: "[redacted]", text: "[redacted]" }]);
      expect(input.rawText).toBe(fullNumber);
    },
  );

  it("censors public slips while preserving masked violations for reviewers and the dataset", () => {
    const input = { ...message, context: [{ ...message }] };
    const publicMessage = serializePublicMessage(input);
    expect(publicMessage.text).toBe("█████");
    expect(publicMessage.slipRule).toBe("Harassment");
    expect(publicMessage.context[0].text).toBe("█████");
    for (const serialize of [serializeReviewerMessage, serializeTestCase]) {
      expect(serialize(input).text).toBe("You are stupid. Call [redacted]");
      expect(serialize(input).context[0].text).toBe("You are stupid. Call [redacted]");
    }
  });

  it("does not censor unconfirmed messages", () => {
    expect(serializePublicMessage({ ...message, slipRule: undefined }).text)
      .toBe("You are stupid. Call [redacted]");
  });

  it("drops off-limits and excluded predecessors from serialized context", () => {
    const input = {
      ...message,
      context: [
        { username: "Player B", text: "visible", filterOutcome: "passed" as const },
        { username: "Player C", text: "hidden", filterOutcome: "off_limits" as const, status: "excluded" as const },
      ],
    };
    const output = serializeReviewerMessage(input);
    expect(output.context).toEqual([{ username: "Player B", text: "visible" }]);
    expect(filterDeliverableContext(input.context)).toHaveLength(1);
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
    expect(Object.keys(output).sort()).toEqual(["context", "reasons", "slipRule", "text", "username"]);
    expect(serializeTestCase(output)).toEqual(output);
  });
});
