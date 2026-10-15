import { describe, expect, it } from "vitest";

import { createMessageReviewAssignment } from "./assignments";
import type { ReviewsDatabase } from "./db";

function createConcurrentDb(): ReviewsDatabase & { handPickedRows: Set<string> } {
  const handPickedRows = new Set<string>();
  return {
    handPickedRows,
    prepare(sql: string) {
      return {
        bind: (...args: unknown[]) => ({
          sql,
          args,
          run: async () => {
            if (sql.includes("UPDATE review_assignments") && sql.includes("expires_at")) {
              return { meta: { changes: 0 } };
            }
            if (sql.includes("'hand_picked'") && sql.includes("INSERT INTO review_assignments")) {
              const messageId = args[2] as string;
              if (handPickedRows.has(messageId)) {
                return { meta: { changes: 0 } };
              }
              handPickedRows.add(messageId);
              return { meta: { changes: 1 } };
            }
            if (sql.includes("'queue'") && sql.includes("INSERT INTO review_assignments")) {
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          },
        }),
      };
    },
    batch: async () => [],
  };
}

describe("createMessageReviewAssignment", () => {
  it("allows only one concurrent hand-picked assignment per message", async () => {
    const db = createConcurrentDb();
    const now = 1_700_000_000;
    const first = await createMessageReviewAssignment(db, "player-a", "msg-1", true, now);
    const second = await createMessageReviewAssignment(db, "player-b", "msg-1", true, now);

    expect(first.assignment).toBe("hand_picked");
    expect(second.assignment).toBe("queue");
  });
});
