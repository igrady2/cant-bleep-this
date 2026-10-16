import { getBoardDatabase, loadBoard } from "@/lib/board";

export async function GET() {
  const db = getBoardDatabase();
  if (db) {
    try {
      const players = await loadBoard(db);
      // Public data only. Browser/shared HTTP caches need no KV writes or paid storage.
      return Response.json({ players }, {
        headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
      });
    } catch {
      // Failed reads must not become a cached empty leaderboard.
    }
  }
  return Response.json({ error: "The leaderboard is unavailable. Please try again." }, {
    status: 503, headers: { "Cache-Control": "no-store" },
  });
}
