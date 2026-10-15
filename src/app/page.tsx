import { ChatRoom } from "@/components/chat/chat-room";
import { ProviderBadge } from "@/components/chat/provider-badge";

export default function Home() {
  return <ChatRoom status={<ProviderBadge />} />;
}
