import { afterEach, expect, it, vi } from "vitest";

import { POST } from "./route";

const { claimUsername, getPlayersDatabase, readWorkerSecret } = vi.hoisted(() => ({
  claimUsername: vi.fn(),
  getPlayersDatabase: vi.fn(),
  readWorkerSecret: vi.fn(),
}));

vi.mock("@/lib/players/claim", () => ({ claimUsername }));
vi.mock("@/lib/players/db", () => ({ getPlayersDatabase, readWorkerSecret }));

afterEach(() => {
  vi.resetAllMocks();
});

it("returns 503 when the database binding is missing", async () => {
  getPlayersDatabase.mockReturnValue(null);
  const response = await POST(
    new Request("https://example.test/api/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "player", turnstileToken: "token" }),
    }),
  );
  expect(response.status).toBe(503);
});

it("returns a claimed username and one-time token", async () => {
  getPlayersDatabase.mockReturnValue({ prepare: vi.fn(), batch: vi.fn() });
  readWorkerSecret.mockImplementation((name: string) => (name ? "configured" : null));
  claimUsername.mockResolvedValue({
    ok: true,
    playerId: "player-1",
    name: "puzzle_fan",
    normalizedName: "puzzle_fan",
    token: "a".repeat(64),
  });

  const response = await POST(
    new Request("https://example.test/api/claim", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "cf-connecting-ip": "203.0.113.4",
      },
      body: JSON.stringify({ name: "puzzle_fan", turnstileToken: "turnstile" }),
    }),
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    playerId: "player-1",
    name: "puzzle_fan",
    normalizedName: "puzzle_fan",
    token: "a".repeat(64),
  });
  expect(claimUsername).toHaveBeenCalledWith(expect.anything(), {
    name: "puzzle_fan",
    turnstileToken: "turnstile",
    remoteIp: "203.0.113.4",
    turnstileSecret: "configured",
    ipHashSalt: "configured",
  });
});
