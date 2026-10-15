import { afterEach, expect, it, vi } from "vitest";

import { POST } from "./route";

const { submitReview, requireAuthenticatedPlayer, getMessagesDatabase, isReviewRateLimited } =
  vi.hoisted(() => ({
    submitReview: vi.fn(),
    requireAuthenticatedPlayer: vi.fn(),
    getMessagesDatabase: vi.fn(),
    isReviewRateLimited: vi.fn(),
  }));

vi.mock("@/lib/reviews/submit", () => ({ submitReview }));
vi.mock("@/lib/players/auth", () => ({ requireAuthenticatedPlayer }));
vi.mock("@/lib/messages/db", () => ({ getMessagesDatabase }));
vi.mock("@/lib/players/db", () => ({ getPlayersDatabase: vi.fn(() => ({})) }));
vi.mock("@/lib/rate-limit", () => ({ isReviewRateLimited }));

afterEach(() => {
  vi.resetAllMocks();
});

it("returns 429 when review rate limited", async () => {
  isReviewRateLimited.mockResolvedValue(true);
  const response = await POST(
    new Request("https://example.test/api/review/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId: "a", action: "fine" }),
    }),
  );
  expect(response.status).toBe(429);
});

it("rejects client-supplied assignment provenance", async () => {
  isReviewRateLimited.mockResolvedValue(false);
  getMessagesDatabase.mockReturnValue({});
  requireAuthenticatedPlayer.mockResolvedValue({
    ok: true,
    player: { id: "p", name: "sam", normalizedName: "sam" },
  });
  const response = await POST(
    new Request("https://example.test/api/review/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignmentId: "a",
        action: "fine",
        assignment: "hand_picked",
      }),
    }),
  );
  expect(response.status).toBe(400);
  expect(submitReview).not.toHaveBeenCalled();
});

it("submits a fine review", async () => {
  isReviewRateLimited.mockResolvedValue(false);
  getMessagesDatabase.mockReturnValue({});
  requireAuthenticatedPlayer.mockResolvedValue({
    ok: true,
    player: { id: "p", name: "sam", normalizedName: "sam" },
  });
  submitReview.mockResolvedValue({ ok: true, reviewId: "r1", skipped: false });
  const response = await POST(
    new Request("https://example.test/api/review/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId: "a", action: "fine" }),
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ reviewId: "r1", skipped: false });
});
