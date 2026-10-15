import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SELF_HARM_CRISIS_NOTE } from "@/lib/content/self-harm-crisis-note";
import { crisisNoteFromAuthorResponse } from "@/lib/messages/author-crisis-note";
import type { PostMessageApiBody } from "@/lib/player-session/client";

import { SelfHarmCrisisNoteBanner } from "./self-harm-crisis-note";

describe("author 988 crisis note after /api/post", () => {
  it("reads crisisNote from a self-harm post API body for the room composer", () => {
    const postBody: PostMessageApiBody = {
      allowed: false,
      outcome: "blocked",
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

    expect(crisisNoteFromAuthorResponse(postBody)).toEqual(SELF_HARM_CRISIS_NOTE);
  });

  it("renders the author banner with 988 lifeline contact options", () => {
    const html = renderToStaticMarkup(
      createElement(SelfHarmCrisisNoteBanner, {
        note: SELF_HARM_CRISIS_NOTE,
        onDismiss: () => {},
      }),
    );
    expect(html).toContain("988");
    expect(html).toContain("988lifeline.org");
    expect(html).toContain(SELF_HARM_CRISIS_NOTE.message);
  });
});
