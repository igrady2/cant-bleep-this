import { afterEach, expect, it, vi } from "vitest";

import { GET } from "./route";

const { getPlayersDatabase, requireAuthenticatedPlayer } = vi.hoisted(() => ({
  getPlayersDatabase: vi.fn(),
  requireAuthenticatedPlayer: vi.fn(),
}));

vi.mock("@/lib/players/db", () => ({ getPlayersDatabase }));
vi.mock("@/lib/players/auth", () => ({ requireAuthenticatedPlayer }));

afterEach(() => {
  vi.resetAllMocks();
});

it("returns 503 when the database binding is missing", async () => {
  getPlayersDatabase.mockReturnValue(null);
  const response = await GET(new Request("https://example.test/api/player"));
  expect(response.status).toBe(503);
});

it("returns the authenticated player profile", async () => {
  getPlayersDatabase.mockReturnValue({ prepare: vi.fn(), batch: vi.fn() });
  requireAuthenticatedPlayer.mockResolvedValue({
    ok: true,
    player: { id: "p1", name: "Al", normalizedName: "al" },
  });

  const response = await GET(
    new Request("https://example.test/api/player", {
      headers: { Authorization: "Bearer token" },
    }),
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    playerId: "p1",
    name: "Al",
    normalizedName: "al",
  });
});

it("forwards auth errors from requireAuthenticatedPlayer", async () => {
  getPlayersDatabase.mockReturnValue({ prepare: vi.fn(), batch: vi.fn() });
  requireAuthenticatedPlayer.mockResolvedValue(
    Response.json({ error: "That token is not valid." }, { status: 401 }),
  );

  const response = await GET(new Request("https://example.test/api/player"));
  expect(response.status).toBe(401);
});
