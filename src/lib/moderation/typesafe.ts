import "server-only";

import { CATEGORIES, type CategoryId } from "./categories";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const RETRYABLE = new Set([429, 529]);
const MAX_ATTEMPTS = 3;

interface NoulAnswer {
  type: "noul";
  noul: number;
}

interface SystemOneResponse {
  model: string;
  answers: Record<string, NoulAnswer>;
}

export class TypeSafeError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "TypeSafeError";
  }
}

export async function scoreWithJev(
  message: string,
  apiKey: string,
  model: string,
): Promise<{ model: string; scores: Record<CategoryId, number> }> {
  const body = {
    model,
    state: {
      forum: {
        name: "School class forum",
        audience:
          "K–12 students and their teachers, posting publicly to the whole class in an online school forum",
        purpose:
          "Classroom discussion, questions, shoutouts, and encouragement",
      },
      message,
    },
    questions: Object.fromEntries(
      CATEGORIES.map((c) => [
        c.id,
        { type: "noul", instructions: c.question.instructions, criteria: c.question.criteria },
      ]),
    ),
  };

  let lastError: TypeSafeError | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 400 * 2 ** (attempt - 1)));
    }

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    if (res.ok) {
      const data = (await res.json()) as SystemOneResponse;
      const scores = {} as Record<CategoryId, number>;
      for (const c of CATEGORIES) {
        const answer = data.answers?.[c.id];
        if (answer?.type !== "noul" || typeof answer.noul !== "number") {
          throw new TypeSafeError(`Missing Noul answer for "${c.id}"`);
        }
        scores[c.id] = answer.noul;
      }
      return { model: data.model, scores };
    }

    const detail = await res.text().catch(() => "");
    lastError = new TypeSafeError(
      `TypeSafe responded ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
      res.status,
    );
    if (!RETRYABLE.has(res.status)) break;
  }

  throw lastError ?? new TypeSafeError("TypeSafe request failed");
}
