"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import type { ModerationResponse } from "@/lib/moderation/types";

import { Composer } from "./composer";
import { EmptyState } from "./empty-state";
import { MessageList, type ChatMessage } from "./message-list";
import { ModerationNotice, type NoticeState } from "./moderation-notice";

export function ChatRoom({ status }: { status?: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<NoticeState>({ kind: "idle" });
  const scrollRef = useRef<HTMLDivElement>(null);

  const checking = notice.kind === "checking";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || checking) return;

    setNotice({ kind: "checking", message });
    try {
      const res = await fetch("/api/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = (await res.json().catch(() => null)) as
        | (ModerationResponse & { error?: undefined })
        | { error: string }
        | null;

      if (!res.ok || !data || "error" in data) {
        setNotice({
          kind: "error",
          message,
          error:
            (data && "error" in data && data.error) ||
            "Something went wrong while checking your message. It wasn't posted.",
        });
        return;
      }

      if (!data.allowed) {
        setNotice({ kind: "blocked", message: data.message, result: data });
        return;
      }

      setMessages((prev) => [...prev, { id: crypto.randomUUID(), text: data.message, sentAt: Date.now() }]);
      setDraft("");
      setNotice({ kind: "idle" });
    } catch {
      setNotice({
        kind: "error",
        message,
        error: "We couldn't reach the server. Check your connection and try again.",
      });
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <main ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            <MessageList messages={messages} />
          )}
        </div>
      </main>

      <footer className="shrink-0 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto w-full max-w-3xl space-y-3 px-4 py-3 sm:px-6 sm:py-4">
          <ModerationNotice
            state={notice}
            onDismiss={() => setNotice({ kind: "idle" })}
            onRetry={(message) => send(message)}
          />
          <Composer
            value={draft}
            onChange={(value) => {
              setDraft(value);
              if (notice.kind === "blocked" || notice.kind === "error") setNotice({ kind: "idle" });
            }}
            status={status}
            busy={checking}
            onSubmit={() => send(draft)}
          />
        </div>
      </footer>
    </div>
  );
}
