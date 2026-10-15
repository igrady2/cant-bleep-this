import { afterEach, describe, expect, it, vi } from "vitest";

import { claimUsernameRequest, fetchPlayerProfile } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("claimUsernameRequest", () => {
  it("returns claim payload on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          playerId: "p1",
          name: "Al",
          normalizedName: "al",
          token: "secret",
        }),
      }),
    );

    const result = await claimUsernameRequest("Al", "turnstile");
    expect(result).toEqual({
      ok: true,
      data: { playerId: "p1", name: "Al", normalizedName: "al", token: "secret" },
    });
  });

  it("returns a player-readable error on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "That name is taken." }),
      }),
    );

    const result = await claimUsernameRequest("Al", "turnstile");
    expect(result).toEqual({ ok: false, error: "That name is taken." });
  });
});

describe("fetchPlayerProfile", () => {
  it("sends bearer and X-Player-Token headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ playerId: "p1", name: "Al", normalizedName: "al" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchPlayerProfile("device-token");

    expect(fetchMock).toHaveBeenCalledWith("/api/player", {
      method: "GET",
      headers: {
        Authorization: "Bearer device-token",
        "X-Player-Token": "device-token",
      },
    });
  });
});
