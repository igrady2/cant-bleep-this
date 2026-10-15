import { afterEach, expect, it, vi } from "vitest";

import { POST } from "./route";

const { assignHandPickedMessage, requireAuthenticatedPlayer, getMessagesDatabase, isReviewRateLimited } =
  vi.hoisted(() => ({
    assignHandPickedMessage: vi.fn(),
    requireAuthenticatedPlayer: vi.fn(),
    getMessagesDatabase: vi.fn(),
    isReviewRateLimited: vi.fn(),
  }));

vi.mock("@/lib/reviews/assign", () => ({ assignHandPickedMessage }));
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
    new Request("https://example.test/api/review/judge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: "m1" }),
    }),
  );
  expect(response.status).toBe(429);
});

it("rejects client-supplied assignment provenance", async () => {
  isReviewRateLimited.mockResolvedValue(false);
  getMessagesDatabase.mockReturnValue({});
  requireAuthenticatedPlayer.mockResolvedValue({
    ok: true,
    player: { id: "p1", name: "alice", normalizedName: "alice" },
  });
  const response = await POST(
    new Request("https://example.test/api/review/judge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: "m1", assignment: "hand_picked" }),
    }),
  );
  expect(response.status).toBe(400);
  expect(assignHandPickedMessage).not.toHaveBeenCalled();
});

it("returns server-chosen assignment and presentation", async () => {
  isReviewRateLimited.mockResolvedValue(false);
  getMessagesDatabase.mockReturnValue({});
  requireAuthenticatedPlayer.mockResolvedValue({
    ok: true,
    player: { id: "p1", name: "alice", normalizedName: "alice" },
  });
  assignHandPickedMessage.mockResolvedValue({
    ok: true,
    payload: {
      assignmentId: "a1",
      assignment: "hand_picked",
      messageId: "m1",
      presentation: { username: "bob", text: "hi", context: [], reasons: [], filterOutcome: "passed", status: "pending" },
    },
  });
  const response = await POST(
    new Request("https://example.test/api/review/judge", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
      body: JSON.stringify({ messageId: "m1" }),
    }),
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.assignmentId).toBe("a1");
  expect(body.assignment).toBe("hand_picked");
  expect(body.messageId).toBe("m1");
  expect(body).not.toHaveProperty("kind");
  expect(body).not.toHaveProperty("seedCaseId");
});
