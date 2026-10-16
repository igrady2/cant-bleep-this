import { verifyAdminHeaders } from "@/lib/admin/access";
import { banPlayerAsMaintainer, loadModerationMessages } from "@/lib/admin/moderation";
import { getMessagesDatabase } from "@/lib/messages/db";
import { removeMessageAsMaintainer } from "@/lib/messages/maintainer-removal";

const NO_STORE = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

async function authorize(request: Request) {
  const access = await verifyAdminHeaders(request.headers);
  if (!access.ok) return json({ error: "Admin access denied." }, access.status);
  // The signed identity is the audit actor. Never accept an actor from JSON.
  if (!access.email?.trim()) return json({ error: "A maintainer identity is required." }, 403);
  return access.email;
}

export async function GET(request: Request) {
  const actor = await authorize(request);
  if (actor instanceof Response) return actor;
  const db = getMessagesDatabase();
  if (db) {
    try { return json({ messages: await loadModerationMessages(db) }); } catch { /* fail closed */ }
  }
  return json({ error: "Moderation is unavailable. Please try again." }, 503);
}

export async function POST(request: Request) {
  const actor = await authorize(request);
  if (actor instanceof Response) return actor;
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== new URL(request.url).origin) {
    return json({ error: "Cross-origin requests are not allowed." }, 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "Send a JSON body." }, 415);
  }
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Send a JSON body." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Send an action and targetId." }, 400);
  const { action, targetId } = body as { action?: unknown; targetId?: unknown };
  if ((action !== "delete_message" && action !== "ban_player") || typeof targetId !== "string"
      || !targetId.trim() || targetId.length > 100) return json({ error: "Send a valid action and targetId." }, 400);
  const db = getMessagesDatabase();
  if (db) {
    try {
      if (action === "delete_message") {
        // Missing/already deleted targets are successful no-ops.
        await removeMessageAsMaintainer(db, targetId, actor);
      } else if (!await banPlayerAsMaintainer(db, targetId, actor)) {
        return json({ error: "Username not found." }, 404);
      }
      return json({ ok: true });
    } catch { /* Do not leak database details. */ }
  }
  return json({ error: "Moderation is unavailable. Please try again." }, 503);
}
