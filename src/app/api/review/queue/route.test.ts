import { afterEach, expect, it, vi } from "vitest";

import { POST } from "./route";

const { assignNextFromQueue, requireAuthenticatedPlayer, getMessagesDatabase, isReviewRateLimited } =
  vi.hoisted(() => ({
    assignNextFromQueue: vi.fn(),
    requireAuthenticatedPlayer: vi.fn(),
    getMessagesDatabase: vi.fn(),
    isReviewRateLimited: vi.fn(),
  }));

vi.mock("@/lib/reviews/assign", () => ({ assignNextFromQueue }));
vi.mock("@/lib/players/auth", () => ({ requireAuthenticatedPlayer }));
vi.mock("@/lib/messages/db", () => ({ getMessagesDatabase }));
vi.mock("@/lib/players/db", () => ({ getPlayersDatabase: vi.fn(() => ({})) }));
vi.mock("@/lib/rate-limit", () => ({ isReviewRateLimited }));

afterEach(() => {
  vi.resetAllMocks();
});

it.each(["message", "seed"])("returns opaque queue payloads for %s targets", async (kind) => {
  isReviewRateLimited.mockResolvedValue(false);
  getMessagesDatabase.mockReturnValue({});
  requireAuthenticatedPlayer.mockResolvedValue({
    ok: true,
    player: { id: "p1", name: "alice", normalizedName: "alice" },
  });
  assignNextFromQueue.mockResolvedValue({
    ok: true,
    payload: {
      assignmentId: "a9",
      assignment: "queue",
      kind,
      messageId: "m9",
      seedCaseId: "private-seed",
      presentation: {
        username: "bob",
        text: "msg",
        context: [],
        reasons: [],
        filterOutcome: "passed",
        status: "pending",
      },
    },
  });
  const response = await POST(
    new Request("https://example.test/api/review/queue", {
      method: "POST",
      headers: { Authorization: "Bearer token" },
    }),
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.assignmentId).toBe("a9");
  expect(body.assignment).toBe("queue");
  expect(Object.keys(body).sort()).toEqual(["assignment", "assignmentId", "presentation"]);
});
