import { describe, expect, it } from "vitest";

import { serializePublicMessage, type MessagePresentation } from "@/lib/presentation";

import { PUBLIC_FEED_MESSAGE_KEYS, loadPublicFeed } from "./feed";
import type { MessagesDatabase } from "./db";

const allowedFeedKeySet = new Set<string>(PUBLIC_FEED_MESSAGE_KEYS);

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
                return [{ message_id: "slip-1", rule: "profanity", flagged_spans: "[]" }];
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
    expect(messages[0]?.text).toBe("b*d w*rds");
    expect(messages[0]?.slipRule).toBe("Profanity");
  });

  it("marks slips a released filter version now catches", async () => {
    const lookups: unknown[][] = [];
    const db = {
      prepare(sql: string) {
        return {
          bind: (...args: unknown[]) => ({
            all: async () => {
              if (sql.includes("FROM messages m")) {
                return [
                  { id: "slip-1", masked_text: "bad", status: "slip", created_at: 5, filter_outcome: "passed", author_name: "a" },
                  { id: "slip-2", masked_text: "bad", status: "slip", created_at: 4, filter_outcome: "passed", author_name: "a" },
                  { id: "clean-1", masked_text: "ok", status: "clean", created_at: 3, filter_outcome: "passed", author_name: "a" },
                ];
              }
              if (sql.includes("FROM patched_slips")) {
                lookups.push(args);
                return [{ message_id: "slip-1", version: "v2" }];
              }
              return [];
            },
          }),
        };
      },
      batch: async () => [],
    } as unknown as MessagesDatabase;

    const messages = await loadPublicFeed(db);
    expect(lookups).toEqual([["slip-1", "slip-2"]]);
    expect(messages.map((m) => [m.id, m.patchedIn])).toEqual([
      ["clean-1", undefined], ["slip-2", undefined], ["slip-1", "v2"],
    ]);
    for (const message of messages) {
      for (const key of Object.keys(message)) expect(allowedFeedKeySet.has(key)).toBe(true);
    }
  });

  it("never exposes author-only crisisNote in feed payloads built from DB rows", async () => {
    const db = createDb([
      {
        id: "m1",
        masked_text: "need help",
        status: "pending",
        created_at: 1,
        filter_outcome: "passed",
        author_name: "sam",
      },
    ]);

    const messages = await loadPublicFeed(db);
    const payload = JSON.stringify({ messages });
    expect(payload).not.toContain("crisisNote");

    for (const message of messages) {
      expect(message).not.toHaveProperty("crisisNote");
      for (const key of Object.keys(message)) {
        expect(allowedFeedKeySet.has(key)).toBe(true);
      }
    }
  });

  it("drops crisisNote from serializePublicMessage before feed projection", () => {
    const input = {
      username: "sam",
      text: "masked text",
      filterOutcome: "passed",
      status: "pending",
      context: [],
      reasons: [],
      crisisNote: {
        headline: "988 Suicide & Crisis Lifeline",
        message: "If you are in crisis, call or text 988.",
        phone: "988",
        url: "https://988lifeline.org",
      },
    } as MessagePresentation & {
      crisisNote: {
        headline: string;
        message: string;
        phone: string;
        url: string;
      };
    };

    const presented = serializePublicMessage(input);
    expect(presented).not.toHaveProperty("crisisNote");

    const feedItem = {
      id: "msg-1",
      author: presented.username,
      text: presented.text,
      createdAt: 1,
      status: presented.status,
    };
    expect(JSON.stringify(feedItem)).not.toContain("crisisNote");
  });
});
