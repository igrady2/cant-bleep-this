import { afterEach, describe, expect, it, vi } from "vitest";

import { SELF_HARM_CRISIS_NOTE } from "@/lib/content/self-harm-crisis-note";
import { crisisNoteFromAuthorResponse } from "@/lib/messages/author-crisis-note";

import { postMessageRequest } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postMessageRequest crisis note", () => {
  it("preserves author-only crisisNote from /api/post JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "msg-self-harm-1",
          outcome: "blocked",
          allowed: false,
          provider: "typesafe",
          message: "synthetic masked example",
          filterOutcome: "blocked",
          status: "pending",
          crisisNote: SELF_HARM_CRISIS_NOTE,
        }),
      }),
    );

    const result = await postMessageRequest("player-token", "synthetic masked example", "key-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(crisisNoteFromAuthorResponse(result.body)).toEqual(SELF_HARM_CRISIS_NOTE);
  });
});
