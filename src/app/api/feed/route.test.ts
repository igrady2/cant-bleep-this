import { afterEach, expect, it, vi } from "vitest";

import { GET } from "./route";

const { loadPublicFeed, getMessagesDatabase } = vi.hoisted(() => ({
  loadPublicFeed: vi.fn(),
  getMessagesDatabase: vi.fn(),
}));

vi.mock("@/lib/messages/feed", () => ({ loadPublicFeed }));
vi.mock("@/lib/messages/db", () => ({ getMessagesDatabase }));
vi.mock("@/lib/players/db", () => ({ getPlayersDatabase: vi.fn(() => null) }));

afterEach(() => {
  vi.resetAllMocks();
});

it("returns 503 when the database binding is missing", async () => {
  getMessagesDatabase.mockReturnValue(null);
  const response = await GET();
  expect(response.status).toBe(503);
});

it("returns serialized feed messages", async () => {
  getMessagesDatabase.mockReturnValue({});
  loadPublicFeed.mockResolvedValue([
    { id: "m1", author: "alice", text: "hi", createdAt: 1, status: "pending" },
  ]);
  const response = await GET();
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.messages).toHaveLength(1);
  expect(body.messages[0].author).toBe("alice");
});

it("does not include author-only crisisNote in feed JSON", async () => {
  getMessagesDatabase.mockReturnValue({});
  loadPublicFeed.mockResolvedValue([
    {
      id: "m1",
      author: "alice",
      text: "hi",
      createdAt: 1,
      status: "pending",
    },
  ]);
  const response = await GET();
  const raw = await response.text();
  expect(raw).not.toContain("crisisNote");
  const body = JSON.parse(raw) as { messages: Record<string, unknown>[] };
  for (const message of body.messages) {
    expect(message).not.toHaveProperty("crisisNote");
  }
});
