import { requireAdmin } from "@/lib/admin/access";
import { setTriageTags } from "@/lib/admin/triage";
import { getMessagesDatabase } from "@/lib/messages/db";

const NO_STORE = { "Cache-Control": "no-store" };

/** Maintainer-only: replace the trick tags on one slip or false positive (#23). */
export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  // The Access cookie rides along on cross-site requests; a JSON body and a
  // same-origin check keep another site from tagging on the maintainer's behalf.
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Cross-origin requests are not allowed." }, { status: 403, headers: NO_STORE });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Send a JSON body." }, { status: 415, headers: NO_STORE });
  }
  let body: { testCaseId?: unknown; tags?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: "Send a JSON body." }, { status: 400, headers: NO_STORE });
  }
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Send a JSON body." }, { status: 400, headers: NO_STORE });
  }

  const db = getMessagesDatabase();
  if (db) {
    try {
      const result = await setTriageTags(db, body.testCaseId, body.tags);
      if (!result.ok) return Response.json({ error: result.error }, { status: result.status, headers: NO_STORE });
      return Response.json({ testCaseId: body.testCaseId, tags: result.tags }, { headers: NO_STORE });
    } catch {
      // Fall through without leaking database details.
    }
  }
  return Response.json({ error: "Triage is unavailable. Please try again." }, { status: 503, headers: NO_STORE });
}
