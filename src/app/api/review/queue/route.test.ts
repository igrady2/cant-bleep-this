import { afterEach, expect, it, vi } from "vitest";

import { POST } from "./route";

const { assignNextFromQueue, requireAuthenticatedPlayer, getMessagesDatabase } = vi.hoisted(() => ({
  assignNextFromQueue: vi.fn(),
  requireAuthenticatedPlayer: vi.fn(),
  getMessagesDatabase: vi.fn(),
}));

vi.mock("@/lib/reviews/assign", () => ({ assignNextFromQueue }));
vi.mock("@/lib/players/auth", () => ({ requireAuthenticatedPlayer }));
vi.mock("@/lib/messages/db", () => ({ getMessagesDatabase }));
vi.mock("@/lib/players/db", () => ({ getPlayersDatabase: vi.fn(() => ({})) }));

afterEach(() => {
  vi.resetAllMocks();
});

it("returns queue assignment payloads", async () => {
  getMessagesDatabase.mockReturnValue({});
  requireAuthenticatedPlayer.mockResolvedValue({
    ok: true,
    player: { id: "p1", name: "alice", normalizedName: "alice" },
  });
  assignNextFromQueue.mockResolvedValue({
    ok: true,
    payload: {
      assignment: "queue",
      kind: "message",
      messageId: "m9",
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
  expect(body.assignment).toBe("queue");
  expect(body.messageId).toBe("m9");
});
