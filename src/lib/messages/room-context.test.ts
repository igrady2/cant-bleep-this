import { expect, it } from "vitest";

import type { MessagesDatabase } from "./db";
import { loadPostRoomContext } from "./room-context";

function fakeDb(shape: "array" | "d1"): MessagesDatabase {
  const wrap = <T>(rows: T[]) => (shape === "d1" ? { success: true, results: rows } : rows);
  return {
    prepare: (sql: string) => ({
      bind: () => ({
        all: async () =>
          sql.includes("FROM players ORDER BY")
            ? wrap([{ name: "kai" }, { name: "sam" }])
            : wrap([
                { id: "m2", masked_text: "second", filter_outcome: "passed", status: "clean", author_name: "sam" },
                { id: "m1", masked_text: "first", filter_outcome: "passed", status: "pending", author_name: "kai" },
              ]),
      }),
    }),
  } as unknown as MessagesDatabase;
}

it.each(["array", "d1"] as const)("loads room context when .all() returns the %s shape", async (shape) => {
  const loaded = await loadPostRoomContext(fakeDb(shape));
  expect(loaded.contextMessageIds).toEqual(["m1", "m2"]);
  expect(loaded.context).toEqual([
    { username: "kai", text: "first" },
    { username: "sam", text: "second" },
  ]);
  expect(loaded.roomUsernames).toEqual(["kai", "sam"]);
});
