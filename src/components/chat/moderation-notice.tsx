"use client";

import { AlertTriangle, Loader2, RotateCcw, ShieldAlert, X } from "lucide-react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ModerationResult } from "@/lib/moderation/types";

export type NoticeState =
  | { kind: "idle" }
  | { kind: "checking"; message: string }
  | { kind: "blocked"; message: string; result: ModerationResult }
  | { kind: "excluded" }
  | { kind: "error"; message: string; error: string };

export function ModerationNotice({
  state,
  onDismiss,
  onRetry,
}: {
  state: NoticeState;
  onDismiss: () => void;
  onRetry: (message: string) => void;
}) {
  if (state.kind === "idle") return null;

  if (state.kind === "checking") {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm text-secondary-foreground"
      >
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
        <span className="truncate">Jev is checking your message before it&apos;s posted…</span>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
        <AlertTriangle aria-hidden />
        <AlertTitle>Couldn&apos;t check your message</AlertTitle>
        <AlertDescription>{state.error}</AlertDescription>
        <AlertAction className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => onRetry(state.message)}>
            <RotateCcw /> Retry
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={onDismiss} aria-label="Dismiss">
            <X />
          </Button>
        </AlertAction>
      </Alert>
    );
  }

  if (state.kind === "excluded") {
    return (
      <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
        <ShieldAlert aria-hidden />
        <AlertTitle className="font-heading text-base">This message wasn&apos;t posted</AlertTitle>
        <AlertDescription className="text-pretty">
          It was removed because it isn&apos;t allowed in this room. It won&apos;t appear in the chat
          or the review queue.
        </AlertDescription>
        <AlertAction>
          <Button size="icon-sm" variant="ghost" onClick={onDismiss} aria-label="Dismiss">
            <X />
          </Button>
        </AlertAction>
      </Alert>
    );
  }

  const { flags, provider } = state.result;
  return (
    <Alert
      variant="destructive"
      className="max-h-[45dvh] overflow-y-auto border-destructive/30 bg-destructive/5 has-data-[slot=alert-action]:pr-2.5"
    >
      <ShieldAlert aria-hidden />
      <AlertTitle className="pr-8 font-heading text-base">
        Your message wasn&apos;t posted
      </AlertTitle>
      <AlertDescription className="w-full space-y-3 text-pretty">
        <blockquote className="border-l-2 border-destructive/40 pl-3 text-foreground/80 italic break-words">
          “{state.message}”
        </blockquote>
        <p>
          {provider === "typesafe" ? "Jev" : "The demo filter"} flagged it as breaking a chat
          rule:
        </p>
        <ul className="w-full space-y-2">
          {flags.map((f) => (
            <li key={f.category} className="rounded-lg bg-background/80 p-3 text-foreground">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{f.label}</span>
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive tabular-nums">
                  {Math.round(f.probability * 100)}% likely
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{f.explanation}</p>
            </li>
          ))}
        </ul>
        <p className="text-xs">Edit your message and try again.</p>
      </AlertDescription>
      <AlertAction>
        <Button size="icon-sm" variant="ghost" onClick={onDismiss} aria-label="Dismiss">
          <X />
        </Button>
      </AlertAction>
    </Alert>
  );
}
