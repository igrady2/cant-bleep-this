import { connection } from "next/server";
import { loadPublicFeed } from "@/lib/messages/feed";
import { getMessagesDatabase } from "@/lib/messages/db";
import { getPlayersDatabase } from "@/lib/players/db";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  await connection();
  const db = getMessagesDatabase() ?? getPlayersDatabase();
  if (!db) {
    return Response.json(
      { error: "The room feed is not available in this environment." },
      { status: 503, headers },
    );
  }

  try {
    const messages = await loadPublicFeed(db);
    return Response.json({ messages }, { headers });
  } catch (err) {
    console.error("[feed]", err);
    return Response.json(
      { error: "We could not load the room feed right now. Please try again." },
      { status: 503, headers },
    );
  }
}
