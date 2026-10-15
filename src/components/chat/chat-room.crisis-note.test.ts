import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
    window.localStorage.clear();
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
});
