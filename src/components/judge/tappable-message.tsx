"use client";

import { useMemo } from "react";

import { cn } from "cn";

export interface TextSpan {
  start: number;
  end: number;
}

interface Token {
  kind: "word" | "other";
  start: number;
  end: number;
  value: string;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\S+/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      tokens.push({
        kind: "other",
        start: last,
        end: match.index,
        value: text.slice(last, match.index),
      });
    }
    tokens.push({
      kind: "word",
      start: match.index,
      end: match.index + match[0].length,
      value: match[0],
    });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    tokens.push({ kind: "other", start: last, end: text.length, value: text.slice(last) });
  }
  return tokens;
}

function spansCover(spans: readonly TextSpan[], start: number, end: number): boolean {
  return spans.some((span) => span.start <= start && span.end >= end);
}

function toggleWordSpan(spans: readonly TextSpan[], start: number, end: number): TextSpan[] {
  const covered = spansCover(spans, start, end);
  let next: TextSpan[];
  if (covered) {
    // Remove this word from any spanning ranges by splitting.
    next = [];
    for (const span of spans) {
      if (span.end <= start || span.start >= end) {
        next.push(span);
        continue;
      }
      if (span.start < start) next.push({ start: span.start, end: start });
      if (span.end > end) next.push({ start: end, end: span.end });
    }
  } else {
    next = [...spans, { start, end }];
  }
  next.sort((a, b) => a.start - b.start || a.end - b.end);
  // Merge contiguous / overlapping.
  const merged: TextSpan[] = [];
  for (const span of next) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) {
      last.end = Math.max(last.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

export function TappableMessage({
  text,
  spans,
  onChange,
  enabled,
}: {
  text: string;
  spans: readonly TextSpan[];
  onChange: (spans: TextSpan[]) => void;
  enabled: boolean;
}) {
  const tokens = useMemo(() => tokenize(text), [text]);

  return (
    <p
      className="rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 leading-relaxed break-words whitespace-pre-wrap"
      aria-label={enabled ? "Target message. Tap words to flag them." : "Target message"}
    >
      {tokens.map((token) => {
        if (token.kind === "other") {
          return <span key={`${token.start}-${token.end}`}>{token.value}</span>;
        }
        const selected = spansCover(spans, token.start, token.end);
        if (!enabled) {
          return <span key={`${token.start}-${token.end}`}>{token.value}</span>;
        }
        return (
          <button
            key={`${token.start}-${token.end}`}
            type="button"
            className={cn(
              "rounded-sm px-0.5 underline-offset-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "bg-destructive/20 text-destructive underline"
                : "hover:bg-accent hover:underline",
            )}
            aria-pressed={selected}
            aria-label={
              selected
                ? `Remove flag from “${token.value}”`
                : `Flag “${token.value}”`
            }
            onClick={() => onChange(toggleWordSpan(spans, token.start, token.end))}
          >
            {token.value}
          </button>
        );
      })}
    </p>
  );
}
