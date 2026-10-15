import { describe, expect, it, vi } from "vitest";

import { verifyTurnstileToken } from "./turnstile";

describe("verifyTurnstileToken", () => {
  it("rejects empty tokens without calling siteverify", async () => {
    const fetchImpl = vi.fn();
    const result = await verifyTurnstileToken("", "secret", "1.2.3.4", fetchImpl);
    expect(result).toEqual({ ok: false, error: "Complete the verification check and try again." });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("accepts a successful siteverify response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    const result = await verifyTurnstileToken("token", "secret", "1.2.3.4", fetchImpl);
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init?.body?.toString()).toContain("response=token");
    expect(init?.body?.toString()).toContain("remoteip=1.2.3.4");
  });

  it("fails closed on HTTP errors and unsuccessful verification", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    expect(await verifyTurnstileToken("token", "secret", null, fetchImpl)).toMatchObject({
      ok: false,
    });

    fetchImpl.mockResolvedValue({
      ok: true,
      json: async () => ({ success: false }),
    });
    expect(await verifyTurnstileToken("token", "secret", null, fetchImpl)).toMatchObject({
      ok: false,
      error: "Verification failed. Please try again.",
    });
  });
});
