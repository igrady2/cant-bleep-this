import { describe, expect, it } from "vitest";

import { loadPublicFeed } from "./feed";
import type { MessagesDatabase } from "./db";

function createDb(rows: Array<{
  id: string;
  masked_text: string;
  status: "pending" | "slip" | "clean";
  created_at: number;
  filter_outcome: "passed" | "blocked" | "off_limits";
  author_name: string;
}>): MessagesDatabase {
  return {
    prepare(sql: string) {
      return {
        bind: (...args: unknown[]) => ({
          all: async () => {
            if (sql.includes("FROM messages m") && sql.includes("ORDER BY")) {
              const limit = args[0] as number;
              return rows
                .filter((row) => row.filter_outcome === "passed")
                .sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id))
                .slice(0, limit);
            }
            if (sql.includes("FROM reviews")) {
              return [];
            }
            return [];
          },
        }),
      };
    },
    batch: async () => [],
  } as MessagesDatabase;
}

describe("loadPublicFeed", () => {
  it("returns masked authors and chronological order", async () => {
    const db = createDb([
      {
        id: "older",
        masked_text: "first",
        status: "pending",
        created_at: 10,
        filter_outcome: "passed",
        author_name: "alice@evil.test",
      },
      {
        id: "newer",
        masked_text: "second",
        status: "pending",
        created_at: 20,
        filter_outcome: "passed",
        author_name: "bob",
      },
      {
        id: "blocked",
        masked_text: "nope",
        status: "pending",
        created_at: 30,
        filter_outcome: "blocked",
        author_name: "eve",
      },
    ]);

    const messages = await loadPublicFeed(db);
    expect(messages.map((m) => m.id)).toEqual(["older", "newer"]);
    expect(messages[0]?.author).toBe("[redacted]");
    expect(messages[0]?.text).toBe("first");
  });

  it("censors confirmed slips for the public feed", async () => {
    const db = {
      prepare(sql: string) {
        return {
          bind: (...args: unknown[]) => ({
            all: async () => {
              if (sql.includes("FROM messages m")) {
                return [
                  {
                    id: "slip-1",
                    masked_text: "bad words",
                    status: "slip",
                    created_at: 5,
                    filter_outcome: "passed",
                    author_name: "alice",
                  },
                ];
              }
              if (sql.includes("FROM reviews")) {
                expect(args[0]).toBe("slip-1");
                return [{ message_id: "slip-1", rule: "profanity" }];
              }
              return [];
            },
          }),
        };
      },
      batch: async () => [],
    } as unknown as MessagesDatabase;

    const messages = await loadPublicFeed(db);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.text).toBe("█████");
    expect(messages[0]?.slipRule).toBe("Profanity");
  });
});
