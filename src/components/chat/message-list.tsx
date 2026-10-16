import Link from "next/link";
import type { MessageStatus } from "@/lib/messages/disposition";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface ChatMessage {
  id: string;
  author: string;
  text: string;
  sentAt: number;
  slipRule?: string;
  /** Released filter version that now catches this slip. */
  patchedIn?: string;
  status?: MessageStatus;
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
  showJudgeActions = false,
}: {
  messages: ChatMessage[];
  playerName?: string | null;
  /** When true, non-author messages link to the hand-picked judge flow. */
  showJudgeActions?: boolean;
}) {
  return (
    <ol className="space-y-5">
      {messages.map((m) => {
        const isSelf = Boolean(playerName && m.author === playerName);
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
                {m.slipRule && m.patchedIn ? (
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                    Patched in {m.patchedIn}
                  </Badge>
                ) : null}
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={new Date(m.sentAt).toISOString()}
                >
                  {timeFormat.format(m.sentAt)}
                </time>
                {showJudgeActions && !isSelf && m.status === "pending" ? (
                  <Button
                    variant="link"
                    size="xs"
                    className="h-auto px-0 text-xs"
                    render={<Link href={`/judge?messageId=${encodeURIComponent(m.id)}`} />}
                  >
                    Judge
                  </Button>
                ) : null}
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
