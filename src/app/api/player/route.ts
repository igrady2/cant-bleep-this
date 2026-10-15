import { requireAuthenticatedPlayer } from "@/lib/players/auth";
import { getPlayersDatabase } from "@/lib/players/db";

export async function GET(request: Request) {
  const db = getPlayersDatabase();
  if (!db) {
    return Response.json(
      { error: "Sign-in is only available in the deployed game environment." },
      { status: 503 },
    );
  }

  const auth = await requireAuthenticatedPlayer(db, request);
  if (auth instanceof Response) {
    return auth;
  }
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  return Response.json({
    playerId: auth.player.id,
    name: auth.player.name,
    normalizedName: auth.player.normalizedName,
  });
}
