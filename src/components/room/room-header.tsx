"use client";

import Link from "next/link";

import { RulesLink } from "@/components/rules/rules-link";
import { readStoredSession } from "@/lib/player-session/storage";

export function RoomHeader() {
  const session = readStoredSession();

  return (
    <header className="shrink-0 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="truncate font-heading text-sm font-semibold">
            {session?.name ?? "Player"}
          </p>
          <p className="text-xs text-muted-foreground">Shared room</p>
        </div>
        <nav className="flex shrink-0 items-center gap-4 text-sm">
          <Link href="/judge" className="text-primary underline-offset-4 hover:underline">
            Judge
          </Link>
          <RulesLink />
        </nav>
      </div>
    </header>
  );
}
