import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SELF_HARM_CRISIS_NOTE } from "@/lib/content/self-harm-crisis-note";
import { STORAGE_KEYS } from "@/lib/player-session/constants";

import { ChatRoom } from "./chat-room";

function blockedSelfHarmPostJson() {
  return {
    id: "msg-self-harm-1",
    outcome: "blocked",
    allowed: false,
    provider: "typesafe",
    model: "jev-test",
    threshold: 0.5,
    offLimitsThreshold: 0.5,
    flags: [
      {
        category: "self_harm",
        label: "Self-harm encouragement",
        probability: 0.72,
        explanation: "Synthetic test flag.",
      },
    ],
    scores: {
      bullying_harassment: 0.02,
      hate_speech: 0.02,
      sexual_content: 0.02,
      violence_threats: 0.02,
      self_harm: 0.72,
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
  };
}

describe("ChatRoom crisis note", () => {
  beforeEach(() => {
    window.localStorage.setItem(STORAGE_KEYS.deviceToken, "test-token");
    window.localStorage.setItem(STORAGE_KEYS.playerId, "player-test");
    window.localStorage.setItem(STORAGE_KEYS.playerName, "alice");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes("/api/feed")) {
          return {
            ok: true,
            json: async () => ({ messages: [] }),
          };
        }
        if (url.includes("/api/post")) {
          return {
            ok: true,
            json: async () => blockedSelfHarmPostJson(),
          };
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the 988 crisis banner after a self-harm post through ChatRoom", async () => {
    const user = userEvent.setup();
    render(createElement(ChatRoom));

    await waitFor(() => {
      expect(screen.queryByText(/Loading the room feed/)).toBeNull();
    });

    const input = screen.getByLabelText(/Write a message/i);
    await user.type(input, "synthetic masked example");
    await user.click(screen.getByRole("button", { name: /Send message/i }));

    await waitFor(() => {
      expect(screen.getByText("You're not alone")).toBeTruthy();
    });
    expect(screen.getByText(SELF_HARM_CRISIS_NOTE.message)).toBeTruthy();
    expect(screen.getByRole("link", { name: SELF_HARM_CRISIS_NOTE.phone })).toBeTruthy();
    expect(screen.getByRole("link", { name: SELF_HARM_CRISIS_NOTE.websiteLabel })).toBeTruthy();
  });

  it("links a paused post to the queue and restores the exact draft after returning", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
      ok: !url.includes("/api/post"), status: url.includes("/api/post") ? 409 : 200,
      json: async () => url.includes("/api/post")
        ? { code: "review_required", error: "Review or skip a message first." }
        : { messages: [] },
    })));
    const user = userEvent.setup();
    const view = render(createElement(ChatRoom));
    const input = screen.getByLabelText(/Write a message/i);
    const text = "  My pending draft!  ";
    await user.type(input, text);
    await user.click(screen.getByRole("button", { name: /Send message/i }));
    const link = await screen.findByRole("link", { name: "Go to review queue" });
    expect(link.getAttribute("href")).toBe("/judge?returnTo=draft");
    expect((input as HTMLTextAreaElement).value).toBe(text);
    view.unmount();
    render(createElement(ChatRoom));
    expect((screen.getByLabelText(/Write a message/i) as HTMLTextAreaElement).value).toBe(text);
  });
});


it("keeps a newer removal response when an older feed request finishes late", async () => {
  const pending: Array<(response: unknown) => void> = [];
  vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => pending.push(resolve))));
  const view = render(createElement(ChatRoom));
  expect(pending).toHaveLength(1);
  // Returning to the tab triggers another request before the first completes.
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(pending).toHaveLength(2);
  await act(async () => pending[1]({ ok: true, json: async () => ({ messages: [] }) }));
  await act(async () => pending[0]({ ok: true, json: async () => ({ messages: [{
    id: "removed", author: "bob", text: "stale original", createdAt: 1, status: "pending",
  }] }) }));
  expect(screen.queryByText("stale original")).toBeNull();
  view.unmount();
  vi.unstubAllGlobals();
});
