"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ArrowUp, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const MAX_LENGTH = 1000;

export function Composer({
  value,
  onChange,
  status,
  busy,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  status?: ReactNode;
  busy: boolean;
  onSubmit: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const empty = value.trim().length === 0;

  useEffect(() => {
    if (!busy) ref.current?.focus();
  }, [busy, value]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-2"
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="min-h-6">{status}</div>
        <span className={cn(value.length > MAX_LENGTH && "font-medium text-destructive")}>
          {value.length}/{MAX_LENGTH}
        </span>
      </div>
      <div className="flex items-end gap-2 rounded-2xl border border-input bg-background p-2 shadow-xs focus-within:border-brand-pink focus-within:ring-3 focus-within:ring-ring/25">
        <label htmlFor="chat-input" className="sr-only">
          Message the class
        </label>
        <Textarea
          id="chat-input"
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onSubmit();
            }
          }}
          readOnly={busy}
          rows={1}
          placeholder="Share something kind with your class…"
          className="max-h-40 min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-base shadow-none focus-visible:ring-0 sm:text-sm dark:bg-transparent"
        />
        <Button
          type="submit"
          size="icon-lg"
          disabled={busy || empty || value.length > MAX_LENGTH}
          className="size-10 shrink-0 rounded-xl"
          aria-label={busy ? "Checking message" : "Send message"}
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : <ArrowUp className="size-5" />}
        </Button>
      </div>
      <p className="hidden text-center text-xs text-muted-foreground sm:block">
        Press <kbd className="font-sans font-semibold">Enter</kbd> to send ·{" "}
        <kbd className="font-sans font-semibold">Shift</kbd> + <kbd className="font-sans font-semibold">Enter</kbd> for a new line
      </p>
    </form>
  );
}
