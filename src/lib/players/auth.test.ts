import { describe, expect, it } from "vitest";

import {
  authenticatePlayerToken,
  readPlayerTokenFromRequest,
} from "./auth";
import { hashPlayerToken } from "./crypto";
import type { PlayersDatabase } from "./db";

function mockDb(row: Record<string, unknown> | null): PlayersDatabase {
  return {
    prepare(sql: string) {
      return {
        bind: () => ({
          first: async <T>() => (sql.includes("FROM players") ? (row as T) : null),
        }),
      };
    },
    batch: async () => [],
  } as PlayersDatabase;
}

describe("player token auth", () => {
  it("reads bearer and custom header tokens", () => {
    expect(
      readPlayerTokenFromRequest(
        new Request("https://example.test", {
          headers: { Authorization: "Bearer device-token" },
        }),
      ),
    ).toBe("device-token");
    expect(
      readPlayerTokenFromRequest(
        new Request("https://example.test", { headers: { "X-Player-Token": "header-token" } }),
      ),
    ).toBe("header-token");
  });

  it("rejects missing, unknown, and banned tokens", async () => {
    expect(await authenticatePlayerToken(mockDb(null), "")).toMatchObject({
      ok: false,
      status: 401,
    });

    const token = "player-token-value";
    const hash = await hashPlayerToken(token);
    expect(
      await authenticatePlayerToken(
        mockDb({
          id: "p1",
          name: "Player",
          normalized_name: "player",
          token_hash: hash,
          banned_at: null,
        }),
        token,
      ),
    ).toMatchObject({ ok: true, player: { id: "p1", name: "Player" } });

    expect(
      await authenticatePlayerToken(
        mockDb({
          id: "p1",
          name: "Player",
          normalized_name: "player",
          token_hash: hash,
          banned_at: 1,
        }),
        token,
      ),
    ).toMatchObject({ ok: false, status: 403 });
  });
});
