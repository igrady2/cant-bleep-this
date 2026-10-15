import { getMessagesDatabase } from "@/lib/messages/db";
import { requireAuthenticatedPlayer } from "@/lib/players/auth";
import { getPlayersDatabase } from "@/lib/players/db";
import { isReviewRateLimited } from "@/lib/rate-limit";
import { assignNextFromQueue } from "@/lib/reviews/assign";

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

  const result = await assignNextFromQueue(db, auth.player);
  if (!result.ok) {
    const body: { error: string; code?: string } = { error: result.error };
    if (result.code) body.code = result.code;
    return Response.json(body, { status: result.status });
  }

  const { payload } = result;
  return Response.json({
    assignmentId: payload.assignmentId,
    assignment: payload.assignment,
    kind: payload.kind,
    ...(payload.messageId ? { messageId: payload.messageId } : {}),
    ...(payload.seedCaseId ? { seedCaseId: payload.seedCaseId } : {}),
    presentation: payload.presentation,
  });
}
