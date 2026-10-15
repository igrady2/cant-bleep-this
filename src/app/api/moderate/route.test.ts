import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";
import { CATEGORIES } from "@/lib/moderation/categories";
import { TypeSafeError } from "@/lib/moderation/typesafe";

const { moderate } = vi.hoisted(() => ({ moderate: vi.fn() }));
vi.mock("@/lib/moderation", () => ({ moderate }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimited: async () => false }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

it.each([true, false])("returns masked presentation while moderating original text (allowed=%s)", async (allowed) => {
  const contact = ["555", "0100"].join("-");
  const email = ["player", "example.test"].join("@");
  const message = `You are stupid. Call ${contact} or ${email}`;
  moderate.mockResolvedValue({
    outcome: allowed ? "passed" : "blocked",
    allowed,
    provider: "typesafe",
    model: "jev-latest",
    threshold: 0.5,
    offLimitsThreshold: 0.5,
    offLimitsScore: 0.03,
    flags: allowed
      ? []
      : [{
          category: "bullying_harassment",
          label: "Harassment",
          probability: 0.9,
          explanation: `Insult with ${contact} and ${email}`,
        }],
    scores: Object.fromEntries(CATEGORIES.map((c) => [c.id, 0.03])),
  });
  const response = await POST(new Request("https://example.test/api/moderate", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }),
  }));
  expect(response.status).toBe(200);
  expect(moderate).toHaveBeenCalledExactlyOnceWith(message);
  const body = await response.json() as { allowed: boolean; message: string; flags: { explanation: string }[] };
  expect(body.allowed).toBe(allowed);
  expect(body.message).toBe("You are stupid. Call [redacted] or [redacted]");
  expect(JSON.stringify(body)).not.toContain(contact);
  expect(JSON.stringify(body)).not.toContain(email);
  if (!allowed) expect(body.flags[0].explanation).toBe("Insult with [redacted] and [redacted]");
});

it("does not return message text for off-limits outcomes", async () => {
  const secret = "plan to bomb the stadium tonight";
  moderate.mockResolvedValue({
    outcome: "off_limits",
    allowed: false,
    provider: "typesafe",
    model: "jev-latest",
    threshold: 0.5,
    offLimitsThreshold: 0.5,
    offLimitsScore: 0.95,
    flags: [],
    scores: Object.fromEntries(CATEGORIES.map((c) => [c.id, 0.03])),
  });
  const response = await POST(new Request("https://example.test/api/moderate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: secret }),
  }));
  expect(response.status).toBe(200);
  const body = await response.json() as Record<string, unknown>;
  expect(body).toEqual({ outcome: "off_limits", allowed: false, provider: "typesafe" });
  expect(JSON.stringify(body)).not.toContain(secret);
});

it("returns an error without echoing the message when Jev returns an invalid Noul score", async () => {
  const secret = "unique-invalid-noul-secret-phrase";
  moderate.mockRejectedValue(new TypeSafeError('Invalid Noul score for "off_limits"'));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const response = await POST(new Request("https://example.test/api/moderate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: secret }),
    }));
    expect(response.status).toBe(503);
    const body = await response.json() as { error: string };
    expect(body.error).toMatch(/unavailable/i);
    expect(JSON.stringify(body)).not.toContain(secret);
  } finally {
    log.mockRestore();
  }
});

it("fails closed when the masking setting is invalid", async () => {
  vi.stubEnv("MASK_MIN_DIGITS", "invalid");
  moderate.mockResolvedValue({
    outcome: "passed",
    allowed: true,
    model: "jev-latest",
    threshold: 0.5,
    offLimitsThreshold: 0.5,
    offLimitsScore: 0.03,
    flags: [],
    scores: Object.fromEntries(CATEGORIES.map((c) => [c.id, 0.03])),
  });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const response = await POST(new Request("https://example.test/api/moderate", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "1234567" }),
    }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("1234567");
  } finally { log.mockRestore(); }
});
