import { requireAdmin } from "@/lib/admin/access";
import { loadSuccessMetrics, parseWindowDays, readJevCostPerCheck } from "@/lib/admin/metrics";
import { getMessagesDatabase } from "@/lib/messages/db";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const days = parseWindowDays(new URL(request.url).searchParams.get("days"));
  if (days === null) {
    return Response.json({ error: "days must be a whole number from 1 to 90." }, { status: 400, headers: NO_STORE });
  }
  try {
    const db = getMessagesDatabase();
    if (db) {
      const cost = readJevCostPerCheck();
      const metrics = await loadSuccessMetrics(db, { days, costPerCheckUsd: cost.perCheckUsd, costRateSource: cost.source });
      return Response.json({ metrics }, { headers: NO_STORE });
    }
  } catch {
    // Do not expose database details to clients.
  }
  return Response.json({ error: "Metrics are unavailable. Please try again." }, { status: 503, headers: NO_STORE });
}
