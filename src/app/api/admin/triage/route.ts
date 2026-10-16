import { requireAdmin } from "@/lib/admin/access";
import { isTriageKind, loadTriage } from "@/lib/admin/triage";
import { getMessagesDatabase } from "@/lib/messages/db";

const NO_STORE = { "Cache-Control": "no-store" };

/** Maintainer-only: slips or false positives grouped by rule (#23). */
export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const kind = new URL(request.url).searchParams.get("kind") ?? "slip";
  if (!isTriageKind(kind)) {
    return Response.json({ error: "kind must be slip or false_positive." }, { status: 400, headers: NO_STORE });
  }
  const db = getMessagesDatabase();
  if (db) {
    try {
      return Response.json(await loadTriage(db, kind), { headers: NO_STORE });
    } catch {
      // Fall through without leaking database details.
    }
  }
  return Response.json({ error: "Triage is unavailable. Please try again." }, { status: 503, headers: NO_STORE });
}
