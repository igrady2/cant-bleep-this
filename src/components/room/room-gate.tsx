"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useSessionGate } from "@/lib/player-session/use-session-gate";

export function RoomGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const gate = useSessionGate();

  useEffect(() => {
    if (gate.kind !== "ready") {
      router.replace("/");
    }
  }, [gate.kind, router]);

  if (gate.kind !== "ready") {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return children;
}
