import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export interface ChatMessage {
  id: string;
  text: string;
  sentAt: number;
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  return (
    <ol className="space-y-5">
      {messages.map((m) => (
        <li key={m.id} className="flex gap-3">
          <Avatar className="mt-0.5 size-9 shrink-0">
            <AvatarFallback
              className="bg-accent font-heading text-sm font-semibold text-accent-foreground"
            >
              Y
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-heading font-semibold">
                You
              </span>
              <time className="text-xs text-muted-foreground" dateTime={new Date(m.sentAt).toISOString()}>
                {timeFormat.format(m.sentAt)}
              </time>
            </div>
            <p className="mt-1 rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 leading-relaxed break-words whitespace-pre-wrap">
              {m.text}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
