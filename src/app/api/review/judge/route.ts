import { getMessagesDatabase } from "@/lib/messages/db";
import { requireAuthenticatedPlayer } from "@/lib/players/auth";
import { getPlayersDatabase } from "@/lib/players/db";
import { isReviewRateLimited } from "@/lib/rate-limit";
import { assignHandPickedMessage } from "@/lib/reviews/assign";

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

  const body = (payload ?? {}) as { messageId?: unknown; assignment?: unknown };
  if (body.assignment !== undefined) {
    return Response.json(
      { error: "The server chooses whether a review is from the queue or hand-picked." },
      { status: 400 },
    );
  }

  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  const result = await assignHandPickedMessage(db, auth.player, messageId);
  if (!result.ok) {
    const responseBody: { error: string; code?: string } = { error: result.error };
    if (result.code) responseBody.code = result.code;
    return Response.json(responseBody, { status: result.status });
  }

  const { payload: assignment } = result;
  return Response.json({
    assignmentId: assignment.assignmentId,
    assignment: assignment.assignment,
    kind: assignment.kind,
    messageId: assignment.messageId,
    presentation: assignment.presentation,
  });
}
