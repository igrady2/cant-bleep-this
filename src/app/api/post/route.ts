import { postMessage } from "@/lib/messages/post";
import { getMessagesDatabase } from "@/lib/messages/db";
import { requireAuthenticatedPlayer } from "@/lib/players/auth";
import { getPlayersDatabase } from "@/lib/players/db";
import { isRateLimited } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (await isRateLimited(request)) {
    return Response.json(
      { error: "You're sending messages too quickly. Wait a minute and try again." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const db = getMessagesDatabase() ?? getPlayersDatabase();
  if (!db) {
    return Response.json(
      { error: "Posting is not available in this environment." },
      { status: 503 },
    );
  }

  const auth = await requireAuthenticatedPlayer(db, request);
  if (auth instanceof Response) return auth;
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }
  const { player } = auth;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const body = (payload ?? {}) as { message?: unknown; idempotencyKey?: unknown };
  const message = typeof body.message === "string" ? body.message : "";
  const idempotencyKey =
    typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined;

  const result = await postMessage(db, player, { text: message, idempotencyKey });
  if (!result.ok) {
    const body: { error: string; code?: string } = { error: result.error };
    if (result.code) body.code = result.code;
    return Response.json(body, { status: result.status });
  }

  return Response.json({ id: result.messageId, ...result.body });
}
