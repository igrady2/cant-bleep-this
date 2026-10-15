import { afterEach, describe, expect, it, vi } from "vitest";

import { SELF_HARM_CRISIS_NOTE } from "@/lib/content/self-harm-crisis-note";
import { CATEGORIES } from "@/lib/moderation/categories";
import { TypeSafeError } from "@/lib/moderation/typesafe";
import { postMessage } from "./post";
import type { MessagesDatabase, MessagesStatement } from "./db";
import { ACTIVE_FILTER_VERSION_ID, DAILY_POSTS_PER_PLAYER, MESSAGE_MAX_LENGTH } from "./limits";

const { moderate } = vi.hoisted(() => ({ moderate: vi.fn() }));
vi.mock("@/lib/moderation", () => ({ moderate }));

afterEach(() => {
  vi.resetAllMocks();
});

const player = {
  id: "player-1",
  name: "alice",
  normalizedName: "alice",
};

function defaultScores() {
  return Object.fromEntries(CATEGORIES.map((c) => [c.id, 0.03]));
}

function createDb(options: {
  batchError?: Error;
  contextRows?: Array<{
    id: string;
    masked_text: string;
    filter_outcome: "passed" | "blocked";
    status: "pending";
    author_name: string;
  }>;
  existingMessage?: {
    id: string;
    text: string;
    filter_outcome: "passed" | "blocked" | "off_limits";
    status: string;
    masked_text: string | null;
    filter_scores: string;
  };
  roomNames?: string[];
  playerPostCount?: number;
  sitePostCount?: number;
}): MessagesDatabase & { batched: MessagesStatement[][] } {
  const batched: MessagesStatement[][] = [];
  return {
    batched,
    prepare(sql: string) {
      const baseAll = async () => {
        if (sql.includes("FROM messages m") && sql.includes("ORDER BY")) {
          return options.contextRows ?? [];
        }
        if (sql.includes("SELECT name FROM players")) {
          return (options.roomNames ?? ["alice"]).map((name) => ({ name }));
        }
        return [];
      };
      return {
        bind: (...args: unknown[]) => {
          const statement: MessagesStatement = {
            sql,
            args,
            all: baseAll as MessagesStatement["all"],
          };
          if (sql.includes("FROM player_daily_posts")) {
            statement.first = (async () => ({
              post_count: options.playerPostCount ?? 0,
            })) as MessagesStatement["first"];
          }
          if (sql.includes("FROM site_daily_posts")) {
            statement.first = (async () => ({
              post_count: options.sitePostCount ?? 0,
            })) as MessagesStatement["first"];
          }
          if (sql.includes("FROM messages WHERE id = ?")) {
            statement.first = (async () => {
              if (
                options.existingMessage
                && args[0] === options.existingMessage.id
                && args[1] === player.id
              ) {
                return options.existingMessage;
              }
              return null;
            }) as MessagesStatement["first"];
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

describe("postMessage", () => {
  it("rejects messages over the PRD length limit", async () => {
    const db = createDb({});
    const result = await postMessage(db, player, {
      text: "x".repeat(MESSAGE_MAX_LENGTH + 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
    expect(moderate).not.toHaveBeenCalled();
  });

  it("loads server context and persists a passed message", async () => {
    moderate.mockResolvedValue({
      outcome: "passed",
      allowed: true,
      provider: "typesafe",
      model: "jev-latest",
      threshold: 0.5,
      offLimitsThreshold: 0.5,
      offLimitsScore: 0.02,
      flags: [],
      scores: defaultScores(),
    });
    const db = createDb({
      contextRows: [
        {
          id: "ctx-1",
          masked_text: "hello room",
          filter_outcome: "passed",
          status: "pending",
          author_name: "bob",
        },
      ],
      roomNames: ["alice", "bob"],
    });

    const result = await postMessage(db, player, { text: "hi everyone" });
    expect(result.ok).toBe(true);
    expect(moderate).toHaveBeenCalledWith("hi everyone", {
      context: [{ username: "bob", text: "hello room" }],
      roomUsernames: ["alice", "bob"],
    });
    expect(db.batched).toHaveLength(1);
    const batch = db.batched[0]!;
    expect(batch).toHaveLength(4);
    expect(batch[0]?.sql).toContain("player_daily_posts");
    expect(batch[1]?.sql).toContain("site_daily_posts");
    const insert = batch[2];
    expect(insert?.sql).toContain("INSERT INTO messages");
    expect(insert?.args).toContain(ACTIVE_FILTER_VERSION_ID);
    expect(insert?.args).toContain(JSON.stringify(["ctx-1"]));
  });

  it("does not persist when Jev fails", async () => {
    moderate.mockRejectedValue(new TypeSafeError("timeout"));
    const db = createDb({});
    const result = await postMessage(db, player, { text: "hello" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(503);
      expect(result.code).toBe("provider_unavailable");
    }
    expect(db.batched).toHaveLength(0);
  });

  it("returns player_cap before calling Jev when the daily cap is already reached", async () => {
    const db = createDb({ playerPostCount: DAILY_POSTS_PER_PLAYER });
    const result = await postMessage(db, player, { text: "hello" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(429);
      expect(result.code).toBe("player_cap");
    }
    expect(moderate).not.toHaveBeenCalled();
    expect(db.batched).toHaveLength(0);
  });

  it("ignores idempotent off-limits rows with corrupt filter_scores JSON", async () => {
    const db = createDb({
      existingMessage: {
        id: "11111111-1111-4111-8111-111111111111",
        text: null as unknown as string,
        filter_outcome: "off_limits",
        status: "excluded",
        masked_text: null,
        filter_scores: "{not-json",
      },
    });
    moderate.mockResolvedValue({
      outcome: "passed",
      allowed: true,
      provider: "typesafe",
      model: "jev-latest",
      threshold: 0.5,
      offLimitsThreshold: 0.5,
      offLimitsScore: 0.02,
      flags: [],
      scores: defaultScores(),
    });
    const result = await postMessage(db, player, {
      text: "retry after corrupt cache",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });
    expect(result.ok).toBe(true);
    expect(moderate).toHaveBeenCalled();
  });

  it("returns the stored outcome on idempotent retry without calling Jev again", async () => {
    const scores = { ...defaultScores(), off_limits: 0.01 };
    const db = createDb({
      existingMessage: {
        id: "11111111-1111-4111-8111-111111111111",
        text: "cached hello",
        filter_outcome: "passed",
        status: "pending",
        masked_text: "cached hello",
        filter_scores: JSON.stringify(scores),
      },
    });
    const result = await postMessage(db, player, {
      text: "cached hello",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });
    expect(result.ok).toBe(true);
    expect(moderate).not.toHaveBeenCalled();
    expect(db.batched).toHaveLength(0);
  });

  it("returns the author-only crisis note when self_harm scores meet threshold", async () => {
    moderate.mockResolvedValue({
      outcome: "blocked",
      allowed: false,
      provider: "typesafe",
      model: "jev-latest",
      threshold: 0.5,
      offLimitsThreshold: 0.5,
      offLimitsScore: 0.02,
      flags: [
        {
          category: "self_harm",
          label: "Self-harm encouragement",
          probability: 0.66,
          explanation: "Synthetic test flag.",
        },
      ],
      scores: { ...defaultScores(), self_harm: 0.66 },
    });
    const db = createDb({});
    const result = await postMessage(db, player, { text: "synthetic masked example" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body).toMatchObject({ crisisNote: SELF_HARM_CRISIS_NOTE });
    }
  });

  it("maps player daily cap check failures to 429", async () => {
    moderate.mockResolvedValue({
      outcome: "passed",
      allowed: true,
      provider: "typesafe",
      model: "jev-latest",
      threshold: 0.5,
      offLimitsThreshold: 0.5,
      offLimitsScore: 0.02,
      flags: [],
      scores: defaultScores(),
    });
    const db = createDb({
      batchError: new Error("CHECK constraint failed: post_count >= 0 AND post_count <= 20"),
    });
    const result = await postMessage(db, player, { text: "one more" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(429);
      expect(result.code).toBe("player_cap");
    }
  });
});
