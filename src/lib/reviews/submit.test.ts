import { beforeEach, expect, it, vi } from "vitest";

import { submitReview } from "./submit";
import type { ReviewsDatabase } from "./db";

const mocks = vi.hoisted(() => ({
  getConsumableReviewAssignment: vi.fn(),
  loadMessageReviewPresentation: vi.fn(),
  loadSeedReviewPresentation: vi.fn(),
}));

vi.mock("./assignments", () => ({
  getConsumableReviewAssignment: mocks.getConsumableReviewAssignment,
}));
vi.mock("./context", () => ({
  loadMessageReviewPresentation: mocks.loadMessageReviewPresentation,
  loadSeedReviewPresentation: mocks.loadSeedReviewPresentation,
}));

const player = { id: "p1", name: "sam", normalizedName: "sam" };
const presentation = {
  username: "kai",
  text: "fuck this fuck",
  context: [],
  reasons: [],
  filterOutcome: "passed" as const,
  status: "pending" as const,
};

function mockDb(options?: { saved?: boolean; batchError?: Error }) {
  const batch = vi.fn(async () => undefined);
  if (options?.batchError) batch.mockRejectedValue(options.batchError);
  const first = vi.fn(async () => (options?.saved === false ? null : { id: "r1" }));
  const prepare = vi.fn((sql: string) => ({
    bind: vi.fn(() => ({
      run: vi.fn(async () => ({ meta: { changes: 1 } })),
      first: sql.includes("SELECT id FROM reviews") ? first : vi.fn(async () => null),
    })),
  }));
  return { prepare, batch } as unknown as ReviewsDatabase & {
    batch: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getConsumableReviewAssignment.mockResolvedValue({
    id: "a1",
    assignment: "queue",
    message_id: "m1",
    seed_case_id: null,
    player_id: "p1",
    expires_at: 9_999_999_999,
    consumed_at: null,
  });
  mocks.loadMessageReviewPresentation.mockResolvedValue(presentation);
});

it("rejects spans on Fine and Skip", async () => {
  const db = mockDb();
  expect(
    await submitReview(db, player, {
      assignmentId: "a1",
      action: "fine",
      flaggedSpans: [{ start: 0, end: 4 }],
    }),
  ).toMatchObject({ ok: false, status: 400 });
  expect(
    await submitReview(db, player, {
      assignmentId: "a1",
      action: "skip",
      flaggedSpans: [{ start: 0, end: 4 }],
    }),
  ).toMatchObject({ ok: false, status: 400 });
});

it("accepts Not OK with optional first-occurrence span", async () => {
  const db = mockDb();
  const result = await submitReview(db, player, {
    assignmentId: "a1",
    action: "not_ok",
    rule: "profanity",
    reason: "Swearing at the start",
    flaggedSpans: [{ start: 0, end: 4 }],
  });
  expect(result).toEqual({ ok: true, reviewId: expect.any(String), skipped: false });
  expect(db.batch).toHaveBeenCalledOnce();
});

it("rejects bare word strings as spans", async () => {
  const db = mockDb();
  expect(
    await submitReview(db, player, {
      assignmentId: "a1",
      action: "not_ok",
      rule: "profanity",
      reason: "bad word",
      flaggedSpans: ["fuck"],
    }),
  ).toMatchObject({ ok: false, status: 400 });
});

it("stores a Skip without a verdict", async () => {
  const db = mockDb();
  const result = await submitReview(db, player, { assignmentId: "a1", action: "skip" });
  expect(result).toEqual({ ok: true, reviewId: expect.any(String), skipped: true });
});
