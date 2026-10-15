import { expect, it } from "vitest";
import { loadSeedReviewPresentation } from "./context";
import { SEED_FIXTURES } from "@/lib/seeds";
import type { ReviewsDatabase } from "./db";
it("uses a stable plausible seed username while preserving snapshot names", async () => {
  const db = { prepare: () => ({ bind: () => ({ first: async () => ({ id: "seed", message: "hello", context_snapshot: JSON.stringify([{ username: "mira", text: "hi" }]) }) }) }) } as unknown as ReviewsDatabase;
  const first = await loadSeedReviewPresentation(db, "seed");
  expect(first?.username).not.toBe("Player");
  expect(first?.username).toMatch(/^[a-z]+_[a-z]+$/);
  expect((await loadSeedReviewPresentation(db, "seed"))?.username).toBe(first?.username);
  expect(first?.context[0].username).toBe("mira");
});

it("removes placeholder leaks from every seed presentation deterministically", async () => {
  for (const seed of SEED_FIXTURES) {
    const db = { prepare: () => ({ bind: () => ({ first: async () => ({
      id: seed.id, message: seed.text, context_snapshot: JSON.stringify(seed.context),
    }) }) }) } as unknown as ReviewsDatabase;
    const presentation = await loadSeedReviewPresentation(db, seed.id);
    expect(presentation).not.toBeNull();
    expect(JSON.stringify(presentation), seed.id).not.toMatch(/\bPlayer [A-Z]\b/);
    expect(presentation?.context.map((line) => line.username)).not.toContain(presentation?.username);
    expect(await loadSeedReviewPresentation(db, seed.id)).toEqual(presentation);
  }
});

it("keeps repeated player references consistent across text and context", async () => {
  const db = { prepare: () => ({ bind: () => ({ first: async () => ({
    id: "seed", message: "Player B agrees with Player C and Player B",
    context_snapshot: JSON.stringify([
      { username: "Player B", text: "Ask Player C" },
      { username: "Player C", text: "Hello Player B" },
    ]),
  }) }) }) } as unknown as ReviewsDatabase;
  const presentation = (await loadSeedReviewPresentation(db, "seed"))!;
  const [b, c] = presentation.context.map((line) => line.username);
  expect(b).not.toBe(c);
  expect(presentation.text).toBe(`${b} agrees with ${c} and ${b}`);
  expect(presentation.context.map((line) => line.text)).toEqual([`Ask ${c}`, `Hello ${b}`]);
  expect([b, c]).not.toContain(presentation.username);
});
