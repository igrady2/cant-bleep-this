import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("D1 migrations", () => {
  it("scopes the review queue index to deliverable rows", () => {
    const sql = readFileSync(join(import.meta.dirname, "0002_queue_excludes_excluded.sql"), "utf8");
    expect(sql).toMatch(/messages_queue/i);
    expect(sql).toContain("filter_outcome IN ('passed', 'blocked')");
    expect(sql).toContain("status <> 'excluded'");
  });
});
