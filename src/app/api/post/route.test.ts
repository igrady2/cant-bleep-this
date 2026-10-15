import { afterEach, expect, it, vi } from "vitest";

import { POST } from "./route";

const { postMessage, requireAuthenticatedPlayer, getMessagesDatabase, isRateLimited } =
  vi.hoisted(() => ({
    postMessage: vi.fn(),
    requireAuthenticatedPlayer: vi.fn(),
    getMessagesDatabase: vi.fn(),
    isRateLimited: vi.fn(),
  }));

vi.mock("@/lib/messages/post", () => ({ postMessage }));
vi.mock("@/lib/players/auth", () => ({ requireAuthenticatedPlayer }));
vi.mock("@/lib/messages/db", () => ({ getMessagesDatabase }));
vi.mock("@/lib/players/db", () => ({ getPlayersDatabase: vi.fn(() => ({})) }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimited }));

afterEach(() => {
  vi.resetAllMocks();
});

it("returns 429 when rate limited", async () => {
  isRateLimited.mockResolvedValue(true);
  const response = await POST(
    new Request("https://example.test/api/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hi" }),
    }),
  );
  expect(response.status).toBe(429);
});

it("returns auth errors from requireAuthenticatedPlayer", async () => {
  isRateLimited.mockResolvedValue(false);
  getMessagesDatabase.mockReturnValue({});
  requireAuthenticatedPlayer.mockResolvedValue(
    Response.json({ error: "That token is not valid." }, { status: 401 }),
  );
  const response = await POST(
    new Request("https://example.test/api/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hi" }),
    }),
  );
  expect(response.status).toBe(401);
});

it("returns machine-readable code on post failures", async () => {
  isRateLimited.mockResolvedValue(false);
  getMessagesDatabase.mockReturnValue({});
  requireAuthenticatedPlayer.mockResolvedValue({
    ok: true,
    player: { id: "p1", name: "alice", normalizedName: "alice" },
  });
  postMessage.mockResolvedValue({
    ok: false,
    status: 429,
    error: "You have reached today's posting limit. Try again tomorrow.",
    code: "player_cap",
  });
  const response = await POST(
    new Request("https://example.test/api/post", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
      body: JSON.stringify({ message: "hello" }),
    }),
  );
  expect(response.status).toBe(429);
  const body = await response.json();
  expect(body.code).toBe("player_cap");
  expect(body.error).toMatch(/posting limit/);
});

it("returns persisted moderation body with message id", async () => {
  isRateLimited.mockResolvedValue(false);
  getMessagesDatabase.mockReturnValue({});
  requireAuthenticatedPlayer.mockResolvedValue({
    ok: true,
    player: { id: "p1", name: "alice", normalizedName: "alice" },
  });
  postMessage.mockResolvedValue({
    ok: true,
    messageId: "msg-1",
    body: {
      outcome: "passed",
      allowed: true,
      provider: "typesafe",
      message: "hello",
      filterOutcome: "passed",
      status: "pending",
    },
  });
  const response = await POST(
    new Request("https://example.test/api/post", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token",
      },
      body: JSON.stringify({ message: "hello" }),
    }),
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.id).toBe("msg-1");
  expect(body.allowed).toBe(true);
  expect(postMessage).toHaveBeenCalled();
});
