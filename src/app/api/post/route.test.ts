import { afterEach, expect, it, vi } from "vitest";

import { SELF_HARM_CRISIS_NOTE } from "@/lib/content/self-harm-crisis-note";

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

it.each([
  [429, "player_cap", "You have reached today's posting limit. Try again tomorrow."],
  [409, "review_required", "Review or skip one message from the queue before posting again."],
])("returns status %i and machine-readable code %s on post failures", async (status, code, error) => {
  isRateLimited.mockResolvedValue(false);
  getMessagesDatabase.mockReturnValue({});
  requireAuthenticatedPlayer.mockResolvedValue({
    ok: true,
    player: { id: "p1", name: "alice", normalizedName: "alice" },
  });
  postMessage.mockResolvedValue({
    ok: false,
    status,
    error,
    code,
  });
  const response = await POST(
    new Request("https://example.test/api/post", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
      body: JSON.stringify({ message: "hello" }),
    }),
  );
  expect(response.status).toBe(status);
  const body = await response.json();
  expect(body.code).toBe(code);
  expect(body.error).toBe(error);
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

it("returns author-only crisisNote on successful self-harm posts", async () => {
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
      outcome: "blocked",
      allowed: false,
      provider: "typesafe",
      model: "jev-test",
      threshold: 0.5,
      offLimitsThreshold: 0.5,
      flags: [],
      scores: {
        bullying_harassment: 0.02,
        hate_speech: 0.02,
        sexual_content: 0.02,
        violence_threats: 0.02,
        self_harm: 0.66,
        profanity: 0.02,
        personal_info: 0.02,
        spam: 0.02,
        impersonation: 0.02,
      },
      offLimitsScore: 0.02,
      message: "synthetic masked example",
      filterOutcome: "blocked",
      status: "pending",
      crisisNote: SELF_HARM_CRISIS_NOTE,
    },
  });
  const response = await POST(
    new Request("https://example.test/api/post", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token",
      },
      body: JSON.stringify({ message: "synthetic masked example" }),
    }),
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.crisisNote).toEqual(SELF_HARM_CRISIS_NOTE);
});
