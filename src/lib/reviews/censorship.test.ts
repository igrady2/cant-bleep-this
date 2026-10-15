import { expect, it } from "vitest";
import { loadSlipCensorship } from "./censorship";
import type { MessagesDatabase } from "@/lib/messages/db";

it("explicitly excludes seed reviews before ranking deciding votes", async () => {
  let query = "";
  const db = { prepare: (sql: string) => {
    query = sql;
    return { bind: () => ({ all: async () => [] }) };
  } } as unknown as MessagesDatabase;
  expect(await loadSlipCensorship(db, ["message"])).toEqual(new Map());
  expect(query).toMatch(/AND r\.seed_case_id IS NULL/);
  expect(query.indexOf("r.seed_case_id IS NULL")).toBeLessThan(query.indexOf("), votes AS"));
});
