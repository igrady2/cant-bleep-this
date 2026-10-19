import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { JudgePanel } from "./judge-panel";
const mocks = vi.hoisted(() => ({ hand: vi.fn(), queue: vi.fn(), submit: vi.fn() }));
vi.mock("@/lib/player-session/client", () => ({
  fetchHandPickedAssignment: mocks.hand, fetchQueueAssignment: mocks.queue, submitReviewRequest: mocks.submit,
}));
vi.mock("@/lib/player-session/storage", () => ({ readStoredSession: () => ({ token: "test" }) }));
const assignment = { ok: true, data: { assignmentId: "a", presentation: {
  username: "sam", text: "hello", context: [],
} } };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.hand.mockResolvedValue(assignment);
  mocks.queue.mockResolvedValue(assignment);
  mocks.submit.mockResolvedValue({ ok: true, skipped: false });
});
afterEach(cleanup);
it.each([false, true])("offers a return to the saved draft after a review or skip (%s)", async (skipped) => {
  mocks.submit.mockResolvedValue({ ok: true, skipped });
  render(<JudgePanel returnToDraft />);
  fireEvent.click(await screen.findByRole("button", { name: skipped ? "Skip" : "Fine" }));
  fireEvent.click(screen.getByRole("button", { name: "Submit review" }));
  expect((await screen.findByRole("link", { name: "Back to your draft" })).getAttribute("href")).toBe("/room");
});
it("Judge next switches a hand-picked review to the queue", async () => {
  render(<JudgePanel messageId="m" />);
  fireEvent.click(await screen.findByRole("button", { name: "Fine" }));
  fireEvent.click(screen.getByRole("button", { name: "Submit review" }));
  fireEvent.click(await screen.findByRole("button", { name: "Judge next" }));
  await screen.findByRole("button", { name: "Submit review" });
  expect(mocks.hand).toHaveBeenCalledTimes(1);
  expect(mocks.queue).toHaveBeenCalledTimes(1);
});
it.each(["assignment_unavailable", "already_reviewed", "message_unavailable"])("removes the form after %s and offers a new queue item", async (code) => {
  mocks.submit.mockResolvedValue({ ok: false, status: 409, code, error: "Get a new review." });
  render(<JudgePanel messageId="m" />);
  fireEvent.click(await screen.findByRole("button", { name: "Fine" }));
  fireEvent.click(screen.getByRole("button", { name: "Submit review" }));
  const next = await screen.findByRole("button", { name: "Get a new one" });
  expect(screen.queryByRole("button", { name: "Submit review" })).toBeNull();
  fireEvent.click(next);
  await screen.findByRole("button", { name: "Submit review" });
  expect(mocks.queue).toHaveBeenCalledTimes(1);
  expect(mocks.hand).toHaveBeenCalledTimes(1);
});
it("starts the next review with an empty reason and no example text in the box", async () => {
  render(<JudgePanel />);
  fireEvent.click(await screen.findByRole("button", { name: "Not OK" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Rule" }), { target: { value: "profanity" } });
  fireEvent.change(screen.getByRole("textbox", { name: "One-line reason" }), { target: { value: "first reason" } });
  fireEvent.click(screen.getByRole("button", { name: "Submit review" }));
  fireEvent.click(await screen.findByRole("button", { name: "Judge next" }));
  fireEvent.click(await screen.findByRole("button", { name: "Not OK" }));
  const reason = screen.getByRole("textbox", { name: "One-line reason" }) as HTMLTextAreaElement;
  expect(reason.value).toBe("");
  expect(reason.placeholder).not.toContain("pro Al");
  expect(reason.getAttribute("autocomplete")).toBe("off");
});
