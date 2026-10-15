import { getMessagesDatabase } from "@/lib/messages/db";
import { requireAuthenticatedPlayer } from "@/lib/players/auth";
import { getPlayersDatabase } from "@/lib/players/db";
import { isReviewRateLimited } from "@/lib/rate-limit";
import { submitReview } from "@/lib/reviews/submit";

export async function POST(request: Request) {
  if (await isReviewRateLimited(request)) {
    return Response.json(
      { error: "You're requesting reviews too quickly. Wait a minute and try again." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const db = getMessagesDatabase() ?? getPlayersDatabase();
  if (!db) {
    return Response.json(
      { error: "Reviewing is not available in this environment." },
      { status: 503 },
    );
  }

  const auth = await requireAuthenticatedPlayer(db, request);
  if (auth instanceof Response) return auth;
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const body = (payload ?? {}) as {
    assignmentId?: unknown;
    action?: unknown;
    rule?: unknown;
    reason?: unknown;
    flaggedSpans?: unknown;
    assignment?: unknown;
  };

  if (body.assignment !== undefined) {
    return Response.json(
      { error: "The server chooses whether a review is from the queue or hand-picked." },
      { status: 400 },
    );
  }

  const result = await submitReview(db, auth.player, {
    assignmentId: typeof body.assignmentId === "string" ? body.assignmentId : "",
    action: body.action as "fine" | "not_ok" | "skip",
    rule: body.rule,
    reason: body.reason,
    flaggedSpans: body.flaggedSpans,
  });

  if (!result.ok) {
    const responseBody: { error: string; code?: string } = { error: result.error };
    if (result.code) responseBody.code = result.code;
    return Response.json(responseBody, { status: result.status });
  }

  return Response.json({
    reviewId: result.reviewId,
    skipped: result.skipped,
  });
}
