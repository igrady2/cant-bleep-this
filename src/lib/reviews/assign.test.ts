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
}): ReviewsDatabase {
  return {
    prepare(sql: string) {
      return {
        bind: (...args: unknown[]) => ({
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
            if (sql.includes("FROM messages m") && sql.includes("context_message_ids")) {
              if (!options.message || args[0] !== options.message.id) return null;
              return options.message;
            }
            return null;
          },
          all: async () => [],
          run: async () => ({ meta: { changes: 1 } }),
        }),
      };
    },
    batch: async () => [],
  } as ReviewsDatabase;
}

describe("assignHandPickedMessage", () => {
  it("rejects judging your own message before creating an assignment", async () => {
    const message = {
      id: "msg-own",
      author_id: player.id,
      filter_outcome: "passed" as const,
      status: "pending" as const,
      text: "mine",
      masked_text: "mine",
      context_message_ids: "[]",
      author_name: "judge",
    };

    const createSpy = vi.spyOn(await import("./assignments"), "createMessageReviewAssignment");
    const result = await assignHandPickedMessage(createDb({ message }), player, message.id);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
    expect(createSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
  });

  it("returns 404 for a missing message without reserving a slot", async () => {
    const createSpy = vi.spyOn(await import("./assignments"), "createMessageReviewAssignment");
    const result = await assignHandPickedMessage(createDb({}), player, "missing-id");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
    expect(createSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
  });

  it("returns hand_picked when the hand-picked slot is available", async () => {
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

    const createSpy = vi.spyOn(await import("./assignments"), "createMessageReviewAssignment");
    createSpy.mockResolvedValue({ id: "assign-1", assignment: "hand_picked" });

    const loadSpy = vi.spyOn(await import("./context"), "loadMessageReviewPresentation");
    loadSpy.mockResolvedValue({
      username: "bob",
      text: "slip",
      filterOutcome: "passed",
      status: "pending",
      reasons: [],
      context: [],
    });

    const result = await assignHandPickedMessage(createDb({ message }), player, message.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.assignment).toBe("hand_picked");
      expect(result.payload.assignmentId).toBe("assign-1");
    }

    createSpy.mockRestore();
    loadSpy.mockRestore();
  });
});
