"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { BoardEntry } from "@/lib/board";

export default function BoardPage() {
  const [players, setPlayers] = useState<BoardEntry[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/board", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Board unavailable");
        const body = await response.json() as { players: BoardEntry[] };
        setPlayers(body.players);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, []);
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-8 sm:px-6">
      <Link href="/room" className="text-primary underline">Back to room</Link>
      <h1 className="mt-6 text-3xl font-bold">Top 50 slips</h1>
      <p className="mt-2 text-muted-foreground">Confirmed slips over 90 UTC days, including today. Each slip counts once. Cached for 5 minutes.</p>
      <p className="mt-2 text-sm text-muted-foreground">Ties sort by player name, then player ID (case-sensitive).</p>
      {error ? <p role="alert" className="mt-6">The leaderboard is unavailable. Please reload to try again.</p>
        : players === null ? <p role="status" className="mt-6">Loading leaderboard…</p>
        : players.length === 0 ? <p className="mt-6">No confirmed slips in the last 90 days yet.</p>
        : <table className="mt-6 w-full text-left">
          <caption className="sr-only">Players ranked by confirmed slip count</caption>
          <thead><tr><th scope="col" className="py-2">Rank</th><th scope="col">Player</th><th scope="col" className="text-right">Slips</th></tr></thead>
          <tbody>{players.map((player, index) => <tr key={player.playerId} className="border-t">
            <td className="py-3">{index + 1}</td><th scope="row" className="font-normal">{player.name}</th><td className="text-right tabular-nums">{player.slips}</td>
          </tr>)}</tbody>
        </table>}
    </main>
  );
}
