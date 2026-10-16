import { requireAdmin } from "@/lib/admin/access";
import { loadReleases, recordFilterRelease } from "@/lib/filter-release/releases";
import { getMessagesDatabase } from "@/lib/messages/db";

const NO_STORE = { "Cache-Control": "no-store" };
const UNAVAILABLE = { error: "Releases are unavailable. Please try again." };

/** Maintainer-only: every recorded filter release with patch-time metrics (#26). */
export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const db = getMessagesDatabase();
  if (db) {
    try {
      return Response.json({ releases: await loadReleases(db) }, { headers: NO_STORE });
    } catch {
      // Fall through without leaking database details.
    }
  }
  return Response.json(UNAVAILABLE, { status: 503, headers: NO_STORE });
}

/**
 * Maintainer-only: record that the active filter version shipped. The body is
 * the gate-passing report from `npm run evaluate:filter`; the release time is now.
 */
export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  // The Access cookie rides along on cross-site requests; a JSON body and a
  // same-origin check keep another site from releasing on the maintainer's behalf.
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Cross-origin requests are not allowed." }, { status: 403, headers: NO_STORE });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Send the release report as JSON." }, { status: 415, headers: NO_STORE });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send the release report as JSON." }, { status: 400, headers: NO_STORE });
  }

  const db = getMessagesDatabase();
  if (db) {
    try {
      const result = await recordFilterRelease(db, body);
      if (!result.ok) return Response.json({ error: result.error }, { status: result.status, headers: NO_STORE });
      return Response.json({ release: result.release }, { status: 201, headers: NO_STORE });
    } catch {
      // Fall through without leaking database details.
    }
  }
  return Response.json(UNAVAILABLE, { status: 503, headers: NO_STORE });
}
