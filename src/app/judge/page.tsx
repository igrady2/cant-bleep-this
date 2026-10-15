import Link from "next/link";

import { RulesLink } from "@/components/rules/rules-link";
import { RoomGate } from "@/components/room/room-gate";
import { Button } from "@/components/ui/button";

export default function JudgePage() {
  return (
    <RoomGate>
      <div className="mx-auto flex max-w-2xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Judge messages</h1>
        <p className="mt-4 text-pretty text-muted-foreground">
          The full review queue ships in a later milestone. When you judge, you&apos;ll see a message
          with the chat around it, then choose Fine or Not OK. For Not OK, pick a rule and explain
          how the message breaks it.
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Open the <RulesLink className="text-sm" /> to check a rule before you choose it.
        </p>
        <Button className="mt-8 w-fit" variant="outline" render={<Link href="/room" />}>
          Back to the room
        </Button>
      </div>
    </RoomGate>
  );
}
