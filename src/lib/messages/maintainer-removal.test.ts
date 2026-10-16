import { describe, expect, it } from "vitest";

import type { MaintainerRemovalDatabase, MaintainerRemovalStatement } from "./maintainer-removal";
import {
  maintainerRemovalEntersTestSet,
  removeMessageAsMaintainer,
} from "./maintainer-removal";

describe("maintainer removal", () => {
  it("never creates a test case", () => {
    expect(maintainerRemovalEntersTestSet()).toBe(false);
  });

  it("hard-deletes the message and decrements a confirmed slip", async () => {
    let batched: MaintainerRemovalStatement[] = [];
    const db = {
      prepare(sql: string) {
        return {
          bind: (...args: unknown[]) => {
            if (sql.startsWith("SELECT")) {
              return {
                first: async () => ({
                  id: "msg-1",
                  author_id: "player-1",
                  status: "slip",
                  created_at: 1_700_000_000,
                }),
              };
            }
            return { sql, args };
          },
        };
      },
      batch: async (statements) => {
        batched = statements;
        return [];
      },
    } as MaintainerRemovalDatabase;

    const result = await removeMessageAsMaintainer(db, "msg-1");
    expect(result).toEqual({ slipPointRemoved: true });
    expect(batched).toHaveLength(2);
    expect(batched[0]?.sql).toContain("UPDATE scores");
    expect(batched[0]?.args).toEqual(["player-1", "2023-11-14"]);
    expect(batched[1]?.sql).toContain("DELETE FROM messages");
  });

  it("returns not_found when the message is already gone", async () => {
    const db = {
      prepare: () => ({
        bind: () => ({ first: async () => null }),
      }),
      batch: async () => [],
    } as MaintainerRemovalDatabase;
    expect(await removeMessageAsMaintainer(db, "missing")).toBe("not_found");
  });
});
