import { afterEach, describe, expect, it, vi } from "vitest";

import { claimUsername } from "./claim";
import type { PlayersDatabase, PlayersStatement } from "./db";

const { validateUsernameForClaim } = vi.hoisted(() => ({
  validateUsernameForClaim: vi.fn(),
}));
vi.mock("./validate", () => ({ validateUsernameForClaim }));

afterEach(() => {
  vi.resetAllMocks();
});

function createDb(options: {
  batchError?: Error;
  existingName?: boolean;
}): PlayersDatabase & { batched: PlayersStatement[][] } {
  const batched: PlayersStatement[][] = [];
  return {
    batched,
    prepare(sql: string) {
      return {
        bind: (...args: unknown[]) => {
          const statement: PlayersStatement = { sql, args };
          if (sql.includes("SELECT 1 FROM players")) {
            statement.first = async <T>() => (options.existingName ? ({ 1: 1 } as T) : null);
          }
          return statement;
        },
      };
    },
    batch: async (statements) => {
      batched.push(statements);
      if (options.batchError) throw options.batchError;
      return [];
    },
  };
}

describe("claimUsername", () => {
  it("claims a validated name after Turnstile passes", async () => {
    validateUsernameForClaim.mockResolvedValue({
      ok: true,
      name: "puzzle_fan",
      normalizedName: "puzzle_fan",
      jevScore: 0.1,
      jevModel: "jev-latest",
      threshold: 0.5,
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    const db = createDb({});

    const result = await claimUsername(db, {
      name: "puzzle_fan",
      turnstileToken: "turnstile-token",
      remoteIp: "203.0.113.9",
      turnstileSecret: "secret",
      ipHashSalt: "salt",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.name).toBe("puzzle_fan");
      expect(result.token).toMatch(/^[0-9a-f]{64}$/);
      expect(db.batched).toHaveLength(1);
      expect(db.batched[0]).toHaveLength(2);
      expect(db.batched[0]?.[0]?.sql).toContain("INSERT INTO players");
      expect(db.batched[0]?.[1]?.sql).toContain("ip_daily_claims");
    }
  });

  it("maps unique name conflicts to a taken error", async () => {
    validateUsernameForClaim.mockResolvedValue({
      ok: true,
      name: "taken_name",
      normalizedName: "taken_name",
      jevScore: 0.1,
      jevModel: "jev-latest",
      threshold: 0.5,
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    const db = createDb({
      batchError: new Error("UNIQUE constraint failed: players.normalized_name"),
      existingName: true,
    });

    const result = await claimUsername(db, {
      name: "taken_name",
      turnstileToken: "turnstile-token",
      remoteIp: "203.0.113.9",
      turnstileSecret: "secret",
      ipHashSalt: "salt",
      fetchImpl,
    });

    expect(result).toMatchObject({
      ok: false,
      status: 409,
      code: "taken",
    });
  });

  it("maps claim-cap constraint failures to a daily limit error", async () => {
    validateUsernameForClaim.mockResolvedValue({
      ok: true,
      name: "fresh_name",
      normalizedName: "fresh_name",
      jevScore: 0.1,
      jevModel: "jev-latest",
      threshold: 0.5,
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    const db = createDb({
      batchError: new Error("CHECK constraint failed: claim_count <= 3"),
      existingName: false,
    });

    const result = await claimUsername(db, {
      name: "fresh_name",
      turnstileToken: "turnstile-token",
      remoteIp: "203.0.113.9",
      turnstileSecret: "secret",
      ipHashSalt: "salt",
      fetchImpl,
    });

    expect(result).toMatchObject({
      ok: false,
      status: 429,
      code: "ip_cap",
    });
  });
});
