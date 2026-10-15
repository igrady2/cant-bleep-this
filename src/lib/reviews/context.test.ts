import { expect, it } from "vitest";
import { loadSeedReviewPresentation } from "./context";
import type { ReviewsDatabase } from "./db";
it("uses a stable plausible seed username while preserving snapshot names", async () => {
  const db = { prepare: () => ({ bind: () => ({ first: async () => ({ id: "seed", message: "hello", context_snapshot: JSON.stringify([{ username: "mira", text: "hi" }]) }) }) }) } as unknown as ReviewsDatabase;
  const first = await loadSeedReviewPresentation(db, "seed");
  expect(first?.username).not.toBe("Player");
  expect(first?.username).toMatch(/^[a-z]+_[a-z]+$/);
  expect((await loadSeedReviewPresentation(db, "seed"))?.username).toBe(first?.username);
  expect(first?.context[0].username).toBe("mira");
});
