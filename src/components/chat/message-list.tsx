import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export interface ChatMessage {
  id: string;
  author: string;
  text: string;
  sentAt: number;
  slipRule?: string;
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function authorInitial(author: string): string {
  const trimmed = author.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

export function MessageList({
  messages,
  playerName,
}: {
  messages: ChatMessage[];
  playerName?: string | null;
}) {
  return (
    <ol className="space-y-5">
      {messages.map((m) => {
        const isSelf = playerName && m.author === playerName;
        return (
          <li key={m.id} className="flex gap-3">
            <Avatar className="mt-0.5 size-9 shrink-0">
              <AvatarFallback
                className="bg-accent font-heading text-sm font-semibold text-accent-foreground"
              >
                {authorInitial(m.author)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-heading font-semibold">
                  {isSelf ? "You" : m.author}
                </span>
                {m.slipRule ? (
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                    Slip · {m.slipRule}
                  </Badge>
                ) : null}
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={new Date(m.sentAt).toISOString()}
                >
                  {timeFormat.format(m.sentAt)}
                </time>
              </div>
              <p className="mt-1 rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 leading-relaxed break-words whitespace-pre-wrap">
                {m.text}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
