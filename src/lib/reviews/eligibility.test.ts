import { describe, expect, it, vi } from "vitest";

import { validateMessageEligibility } from "./eligibility";
import type { ReviewsDatabase } from "./db";

const player = { id: "reviewer-1", name: "judge", normalizedName: "judge" };

function createDb(options: {
  message?: {
    id: string;
    author_id: string;
    filter_outcome: "passed" | "blocked";
    status: "pending";
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

describe("validateMessageEligibility", () => {
  it("rejects judging your own message before creating an assignment", async () => {
    const message = {
      id: "msg-own",
      author_id: player.id,
      filter_outcome: "passed" as const,
      status: "pending" as const,
    };

    const createSpy = vi.spyOn(await import("./assignments"), "createMessageReviewAssignment");
    const result = await validateMessageEligibility(createDb({ message }), message.id, player);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
    expect(createSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
  });

  it("returns 404 for a missing message without reserving a slot", async () => {
    const createSpy = vi.spyOn(await import("./assignments"), "createMessageReviewAssignment");
    const result = await validateMessageEligibility(createDb({}), "missing-id", player);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
    expect(createSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
  });
});
