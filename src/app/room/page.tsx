import { ChatRoom } from "@/components/chat/chat-room";
import { ProviderBadge } from "@/components/chat/provider-badge";
import { RoomGate } from "@/components/room/room-gate";
import { RoomHeader } from "@/components/room/room-header";

export default function RoomPage() {
  return (
    <RoomGate>
      <div className="flex min-h-0 flex-1 flex-col">
        <RoomHeader />
        <ChatRoom status={<ProviderBadge />} />
      </div>
    </RoomGate>
  );
}
