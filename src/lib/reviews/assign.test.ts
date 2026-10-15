import { describe, expect, it, vi } from "vitest";

import { assignHandPickedMessage } from "./assign";
import type { ReviewsDatabase } from "./db";

const player = { id: "reviewer-1", name: "judge", normalizedName: "judge" };

function createDb(options: {
  message?: {
    id: string;
    author_id: string;
    filter_outcome: "passed" | "blocked";
    status: "pending";
    text: string;
    masked_text: string;
    context_message_ids: string;
    author_name: string;
  };
  existingReview?: boolean;
  reservationChanges?: number;
}): ReviewsDatabase {
  return {
    prepare(sql: string) {
      return {
        bind: (...args: unknown[]) => {
          const statement = {
            sql,
            args,
            first: async () => {
              if (sql.includes("FROM messages m") && sql.includes("author_id")) {
                if (!options.message || args[0] !== options.message.id) return null;
                return {
                  author_id: options.message.author_id,
                  filter_outcome: options.message.filter_outcome,
                  status: options.message.status,
                };
              }
              if (sql.includes("FROM reviews") && sql.includes("player_id")) {
                return options.existingReview ? { found: 1 } : null;
              }
              if (sql.includes("loadMessageReviewPresentation")) return null;
              if (sql.includes("FROM messages m") && sql.includes("context_message_ids")) {
                if (!options.message || args[0] !== options.message.id) return null;
                return options.message;
              }
              return null;
            },
            all: async () => [],
            run: async () => ({
              meta: { changes: options.reservationChanges ?? 1 },
            }),
          };
          return statement;
        },
      };
    },
    batch: async () => [],
  } as ReviewsDatabase;
}

describe("assignHandPickedMessage", () => {
  it("returns queue assignment when the hand-picked slot is already reserved", async () => {
    const message = {
      id: "msg-1",
      author_id: "author-1",
      filter_outcome: "passed" as const,
      status: "pending" as const,
      text: "hello",
      masked_text: "hello",
      context_message_ids: "[]",
      author_name: "alice",
    };

    const db = createDb({ message, reservationChanges: 0 });
    const loadSpy = vi.spyOn(await import("./context"), "loadMessageReviewPresentation");
    loadSpy.mockResolvedValue({
      username: "alice",
      text: "hello",
      filterOutcome: "passed",
      status: "pending",
      reasons: [],
      context: [],
    });

    const result = await assignHandPickedMessage(db, player, message.id);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.assignment).toBe("queue");

    loadSpy.mockRestore();
  });

  it("returns hand_picked when the reservation insert succeeds", async () => {
    const message = {
      id: "msg-2",
      author_id: "author-2",
      filter_outcome: "passed" as const,
      status: "pending" as const,
      text: "slip",
      masked_text: "slip",
      context_message_ids: "[]",
      author_name: "bob",
    };

    const db = createDb({ message, reservationChanges: 1 });
    const loadSpy = vi.spyOn(await import("./context"), "loadMessageReviewPresentation");
    loadSpy.mockResolvedValue({
      username: "bob",
      text: "slip",
      filterOutcome: "passed",
      status: "pending",
      reasons: [],
      context: [],
    });

    const result = await assignHandPickedMessage(db, player, message.id);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.assignment).toBe("hand_picked");

    loadSpy.mockRestore();
  });
});
