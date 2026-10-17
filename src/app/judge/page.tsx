import { Suspense } from "react";

import { JudgePageClient } from "@/components/judge/judge-page-client";
import { RoomGate } from "@/components/room/room-gate";

export default function JudgePage() {
  return (
    <RoomGate>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Judge messages</h1>
          <p className="mt-4 text-pretty text-muted-foreground">
            You see the target with the chat before it, then choose Fine, Not OK, or Skip. Not OK needs
            a rule and a one-line reason; tapping words to flag is optional.
          </p>
          <div className="mt-8">
            <Suspense fallback={<p className="text-muted-foreground">Loading a message to judge…</p>}>
              <JudgePageClient />
            </Suspense>
          </div>
        </div>
      </div>
    </RoomGate>
  );
}
