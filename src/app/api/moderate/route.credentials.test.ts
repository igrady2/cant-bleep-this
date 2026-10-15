import { afterEach, expect, it, vi } from "vitest";

import { POST } from "./route";

vi.mock("@/lib/rate-limit", () => ({ isRateLimited: async () => false }));

afterEach(() => {
  vi.unstubAllEnvs();
});

it("fails closed when TYPESAFE_API_KEY is not configured", async () => {
  vi.stubEnv("TYPESAFE_API_KEY", "");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const response = await POST(
      new Request("https://example.test/api/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      }),
    );
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: string; allowed?: boolean };
    expect(body.error).toMatch(/unavailable/i);
    expect(body.allowed).toBeUndefined();
  } finally {
    log.mockRestore();
  }
});
