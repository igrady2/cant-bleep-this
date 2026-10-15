"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";

import { FEED_REFRESH_INTERVAL_MS } from "@/lib/messages/room-config";
import { useAuthorCrisisNote } from "@/lib/messages/use-author-crisis-note";
import {
  fetchRoomFeed,
  postMessageRequest,
  type FeedMessage,
  type PostMessageApiBody,
} from "@/lib/player-session/client";
import { readStoredSession } from "@/lib/player-session/storage";
import type { ModerationResult } from "@/lib/moderation/types";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { Composer } from "./composer";
import { EmptyState } from "./empty-state";
import { MessageList } from "./message-list";
import { ModerationNotice, type NoticeState } from "./moderation-notice";
import { SelfHarmCrisisNoteBanner } from "./self-harm-crisis-note";

function toChatMessages(feed: FeedMessage[]) {
  return feed.map((message) => ({
    id: message.id,
    author: message.author,
    text: message.text,
    sentAt: message.createdAt * 1000,
    slipRule: message.slipRule,
  }));
}

function moderationResultFromPost(body: PostMessageApiBody): ModerationResult | null {
  if (body.outcome === "off_limits") return null;
  return {
    allowed: body.allowed,
    outcome: body.filterOutcome === "blocked" ? "blocked" : "passed",
    provider: body.provider,
    model: body.model,
    threshold: body.threshold,
    offLimitsThreshold: body.offLimitsThreshold,
    flags: body.flags,
    scores: body.scores,
    offLimitsScore: body.offLimitsScore,
  };
}

export function ChatRoom({ status }: { status?: ReactNode }) {
  const [playerName] = useState(() => readStoredSession()?.name ?? null);
  const [messages, setMessages] = useState<ReturnType<typeof toChatMessages>>([]);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<NoticeState>({ kind: "idle" });
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const { crisisNote, applyAuthorResponse, clearCrisisNote, resetCrisisNoteForPostAttempt } =
    useAuthorCrisisNote();
  const scrollRef = useRef<HTMLDivElement>(null);
  const idempotencyRef = useRef<string | null>(null);

  const checking = notice.kind === "checking";

  const clearPostAttempt = useCallback(() => {
    idempotencyRef.current = null;
  }, []);

  const beginPostAttempt = useCallback(() => {
    if (!idempotencyRef.current) {
      idempotencyRef.current = crypto.randomUUID();
    }
    return idempotencyRef.current;
  }, []);

  const applyFeedResult = useCallback(
    (
      result: Awaited<ReturnType<typeof fetchRoomFeed>>,
      options?: { initial?: boolean },
    ) => {
      if (!result.ok) {
        setFeedError(result.error);
        if (options?.initial) setFeedLoading(false);
        return;
      }
      setFeedError(null);
      setMessages(toChatMessages(result.messages));
      if (options?.initial) setFeedLoading(false);
    },
    [],
  );

  const refreshFeed = useCallback(
    (options?: { initial?: boolean }) => {
      void fetchRoomFeed().then((result) => applyFeedResult(result, options));
    },
    [applyFeedResult],
  );

  useEffect(() => {
    void fetchRoomFeed().then((result) => applyFeedResult(result, { initial: true }));
  }, [applyFeedResult]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      if (document.visibilityState === "visible") {
        void fetchRoomFeed().then((result) => applyFeedResult(result));
      }
    };

    const start = () => {
      if (document.visibilityState !== "visible") return;
      timer = setInterval(tick, FEED_REFRESH_INTERVAL_MS);
    };

    const onVisibility = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (document.visibilityState === "visible") {
        void fetchRoomFeed().then((result) => applyFeedResult(result));
        start();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [applyFeedResult]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || checking) return;

    const session = readStoredSession();
    if (!session) {
      setNotice({
        kind: "error",
        message,
        error: "Your session expired. Go back and claim your username again.",
      });
      return;
    }

    resetCrisisNoteForPostAttempt();
    const idempotencyKey = beginPostAttempt();
    setNotice({ kind: "checking", message });
    try {
      const result = await postMessageRequest(session.token, message, idempotencyKey);
      if (!result.ok) {
        setNotice({
          kind: "error",
          message,
          error: result.error,
        });
        if (result.status !== 503 && result.status !== 502 && result.status !== 429) {
          clearPostAttempt();
        }
        return;
      }

      const { body } = result;
      applyAuthorResponse(body);

      if (body.outcome === "off_limits") {
        clearPostAttempt();
        setNotice({ kind: "excluded" });
        return;
      }

      const moderation = moderationResultFromPost(body);
      if (!moderation?.allowed) {
        if (!moderation) {
          clearPostAttempt();
          setNotice({ kind: "excluded" });
          return;
        }
        clearPostAttempt();
        setNotice({
          kind: "blocked",
          message: body.message ?? message,
          result: moderation,
        });
        return;
      }

      clearPostAttempt();
      setDraft("");
      setNotice({ kind: "idle" });
      refreshFeed();
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
      {feedError ? (
        <div className="shrink-0 border-b border-border px-4 py-2 sm:px-6">
          <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
            <AlertTriangle aria-hidden />
            <AlertTitle>Couldn&apos;t refresh the feed</AlertTitle>
            <AlertDescription>{feedError}</AlertDescription>
            <AlertAction>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setFeedLoading(true);
                  refreshFeed({ initial: true });
                }}
              >
                <RotateCcw /> Retry
              </Button>
            </AlertAction>
          </Alert>
        </div>
      ) : null}

      <main ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          {feedLoading ? (
            <div
              role="status"
              className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading the room feed…
            </div>
          ) : messages.length === 0 ? (
            <EmptyState />
          ) : (
            <MessageList messages={messages} playerName={playerName} showJudgeActions />
          )}
        </div>
      </main>

      <footer className="shrink-0 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto w-full max-w-3xl space-y-3 px-4 py-3 sm:px-6 sm:py-4">
          {crisisNote ? (
            <SelfHarmCrisisNoteBanner note={crisisNote} onDismiss={clearCrisisNote} />
          ) : null}
          <ModerationNotice
            state={notice}
            onDismiss={() => {
              setNotice({ kind: "idle" });
              clearPostAttempt();
            }}
            onRetry={(message) => send(message)}
          />
          <Composer
            value={draft}
            onChange={(value) => {
              setDraft(value);
              if (notice.kind === "blocked" || notice.kind === "error") {
                setNotice({ kind: "idle" });
                clearPostAttempt();
              }
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
