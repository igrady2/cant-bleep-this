import { beforeEach, expect, it, vi } from "vitest";
import { assignHandPickedMessage, assignNextFromQueue } from "./assign";
import type { ReviewsDatabase } from "./db";
const mocks = vi.hoisted(() => ({
  createMessageReviewAssignment: vi.fn(), createSeedReviewAssignment: vi.fn(), findOpenReviewAssignment: vi.fn(),
  loadMessageReviewPresentation: vi.fn(), loadSeedReviewPresentation: vi.fn(),
  validateMessageEligibility: vi.fn(), pickNextQueueTarget: vi.fn(),
}));
vi.mock("./assignments", () => mocks);
vi.mock("./context", () => mocks);
vi.mock("./eligibility", () => mocks);
vi.mock("./queue", () => mocks);
const db = {} as ReviewsDatabase;
const player = { id: "p", name: "sam", normalizedName: "sam" };
const presentation = { username: "kai_music", text: "hello", context: [], reasons: [], filterOutcome: "passed", status: "pending" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.validateMessageEligibility.mockResolvedValue({ ok: true });
  mocks.findOpenReviewAssignment.mockResolvedValue(null);
});
it("does not insert a message assignment if presentation loading fails", async () => {
  mocks.loadMessageReviewPresentation.mockResolvedValue(null);
  expect(await assignHandPickedMessage(db, player, "m")).toMatchObject({ ok: false, status: 404 });
  expect(mocks.createMessageReviewAssignment).not.toHaveBeenCalled();
});
it("does not insert a seed assignment if presentation loading fails", async () => {
  mocks.pickNextQueueTarget.mockResolvedValue({ kind: "seed", seedCaseId: "s" });
  mocks.loadSeedReviewPresentation.mockResolvedValue(null);
  expect(await assignNextFromQueue(db, player)).toMatchObject({ ok: false });
  expect(mocks.createSeedReviewAssignment).not.toHaveBeenCalled();
});
it.each(["message", "seed"])("reuses an open %s assignment without picking or inserting", async (kind) => {
  mocks.findOpenReviewAssignment.mockResolvedValue({ id: "existing", assignment: "queue", message_id: kind === "message" ? "m" : null, seed_case_id: kind === "seed" ? "s" : null });
  mocks.loadMessageReviewPresentation.mockResolvedValue(presentation);
  mocks.loadSeedReviewPresentation.mockResolvedValue(presentation);
  const result = await assignNextFromQueue(db, player);
  expect(result).toMatchObject({ ok: true, payload: { assignmentId: "existing", assignment: "queue" } });
  if (result.ok) expect(Object.keys(result.payload).sort()).toEqual(["assignment", "assignmentId", "presentation"]);
  expect(mocks.pickNextQueueTarget).not.toHaveBeenCalled();
  expect(mocks.createMessageReviewAssignment).not.toHaveBeenCalled();
  expect(mocks.createSeedReviewAssignment).not.toHaveBeenCalled();
});
it("returns only an opaque assignment for a new seed", async () => {
  mocks.pickNextQueueTarget.mockResolvedValue({ kind: "seed", seedCaseId: "s" });
  mocks.loadSeedReviewPresentation.mockResolvedValue(presentation);
  mocks.createSeedReviewAssignment.mockResolvedValue({ id: "opaque", assignment: "queue" });
  const result = await assignNextFromQueue(db, player);
  if (!result.ok) throw new Error("Expected assignment");
  expect(Object.keys(result.payload).sort()).toEqual(["assignment", "assignmentId", "presentation"]);
  expect(mocks.loadSeedReviewPresentation.mock.invocationCallOrder[0]).toBeLessThan(mocks.createSeedReviewAssignment.mock.invocationCallOrder[0]);
});
