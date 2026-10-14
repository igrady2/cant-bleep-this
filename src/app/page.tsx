import { Suspense } from "react";
import { connection } from "next/server";

import { ChatRoom } from "@/components/chat/chat-room";
import { ProviderBadge } from "@/components/chat/provider-badge";
import { activeProvider } from "@/lib/moderation";

async function ModerationStatus() {
  await connection();
  return <ProviderBadge provider={activeProvider()} />;
}

export default function Home() {
  return (
    <ChatRoom
      status={
        <Suspense fallback={null}>
          <ModerationStatus />
        </Suspense>
      }
    />
  );
}
