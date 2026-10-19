"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { RulesLink } from "@/components/rules/rules-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { REVIEW_RULE_OPTIONS } from "@/lib/moderation/review-rules";
import type { CategoryId } from "@/lib/moderation/categories";
import {
  fetchHandPickedAssignment,
  fetchQueueAssignment,
  submitReviewRequest,
  type ReviewAssignmentResponse,
  type ReviewSubmitAction,
} from "@/lib/player-session/client";
import { readStoredSession } from "@/lib/player-session/storage";

import { TappableMessage, type TextSpan } from "./tappable-message";

type PanelState =
  | { kind: "loading" }
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string; unavailable?: boolean }
  | { kind: "ready"; assignment: ReviewAssignmentResponse }
  | { kind: "submitted"; skipped: boolean; queueAssignment: boolean };

export function JudgePanel({ messageId, returnToDraft = false }: { messageId?: string | null; returnToDraft?: boolean }) {
  const [state, setState] = useState<PanelState>({ kind: "loading" });
  const [action, setAction] = useState<ReviewSubmitAction | null>(null);
  const [rule, setRule] = useState<CategoryId | "">("");
  const [reason, setReason] = useState("");
  const [spans, setSpans] = useState<TextSpan[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const applyAssignmentResult = useCallback(
    (
      result:
        | { ok: true; data: ReviewAssignmentResponse }
        | { ok: false; error: string; status: number; code?: string },
    ) => {
      if (!result.ok) {
        if (result.code === "queue_empty" || result.status === 404) {
          setState({
            kind: "empty",
            message: result.error || "Nothing is waiting for review right now.",
          });
          return;
        }
        setState({ kind: "error", message: result.error, unavailable: result.status === 409 });
        return;
      }
      setState({ kind: "ready", assignment: result.data });
    },
    [],
  );

  const load = useCallback(async (fromQueue = false) => {
    setAction(null);
    setRule("");
    setReason("");
    setSpans([]);
    setFormError(null);
    setState({ kind: "loading" });

    const session = readStoredSession();
    if (!session?.token) {
      setState({ kind: "error", message: "Sign in with a username before you judge." });
      return;
    }

    const result = messageId && !fromQueue
      ? await fetchHandPickedAssignment(session.token, messageId)
      : await fetchQueueAssignment(session.token);
    applyAssignmentResult(result);
  }, [applyAssignmentResult, messageId]);

  useEffect(() => {
    const session = readStoredSession();
    if (!session?.token) {
      const timer = window.setTimeout(() => {
        setState({ kind: "error", message: "Sign in with a username before you judge." });
      }, 0);
      return () => window.clearTimeout(timer);
    }
    let cancelled = false;
    const request = messageId
      ? fetchHandPickedAssignment(session.token, messageId)
      : fetchQueueAssignment(session.token);
    void request.then((result) => {
      if (!cancelled) applyAssignmentResult(result);
    });
    return () => {
      cancelled = true;
    };
  }, [applyAssignmentResult, messageId]);

  async function handleSubmit() {
    if (state.kind !== "ready" || !action) return;
    const session = readStoredSession();
    if (!session?.token) {
      setFormError("Sign in with a username before you judge.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    const body: Parameters<typeof submitReviewRequest>[1] = {
      assignmentId: state.assignment.assignmentId,
      action,
    };
    if (action === "not_ok") {
      if (!rule) {
        setFormError("Pick a rule for Not OK.");
        setSubmitting(false);
        return;
      }
      if (!reason.trim()) {
        setFormError("Add a one-line reason for Not OK.");
        setSubmitting(false);
        return;
      }
      body.rule = rule;
      body.reason = reason.trim();
      body.flaggedSpans = spans;
    }
    const result = await submitReviewRequest(session.token, body);
    setSubmitting(false);
    if (!result.ok) {
      if (result.status === 409) {
        setState({ kind: "error", message: result.error, unavailable: true });
        return;
      }
      setFormError(result.error);
      return;
    }
    setState({ kind: "submitted", skipped: result.skipped, queueAssignment: state.assignment.assignment === "queue" });
  }

  if (state.kind === "loading") {
    return (
      <div className="flex items-center gap-2 text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading a message to judge…
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load a review</AlertTitle>
        <AlertDescription>{state.message}</AlertDescription>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void load(Boolean(state.unavailable))}>
            {state.unavailable ? "Get a new one" : "Try again"}
          </Button>
          <Button variant="outline" render={<Link href="/room" />}>
            {returnToDraft ? "Back to your draft" : "Back to the room"}
          </Button>
        </div>
      </Alert>
    );
  }

  if (state.kind === "empty") {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">{state.message}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void load()}>
            Check again
          </Button>
          <Button variant="outline" render={<Link href="/room" />}>
            {returnToDraft ? "Back to your draft" : "Back to the room"}
          </Button>
        </div>
      </div>
    );
  }

  if (state.kind === "submitted") {
    return (
      <div className="space-y-4">
        <Alert>
          <AlertTitle>{state.skipped ? "Skipped" : "Review saved"}</AlertTitle>
          <AlertDescription>
            {state.skipped
              ? state.queueAssignment
                ? "That skip counts toward your review requirement, but not toward the message’s three reviews."
                : "Skipped. To satisfy a review requirement, judge a message or skip one assigned by the queue."
              : "Thanks — your judgment is in."}
          </AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void load(true)}>
            Judge next
          </Button>
          <Button variant="outline" render={<Link href="/room" />}>
            {returnToDraft ? "Back to your draft" : "Back to the room"}
          </Button>
        </div>
      </div>
    );
  }

  const { presentation } = state.assignment;
  const notOk = action === "not_ok";

  return (
    <div className="space-y-6">
      <section aria-label="Chat context" className="space-y-3">
        <h2 className="font-heading text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Preceding messages
        </h2>
        {presentation.context.length === 0 ? (
          <p className="text-sm text-muted-foreground">No earlier messages in this thread.</p>
        ) : (
          <ol className="space-y-3">
            {presentation.context.map((entry, index) => (
              <li key={`${entry.username}-${index}`} className="text-sm">
                <span className="font-heading font-semibold">{entry.username}</span>
                <p className="mt-1 rounded-2xl rounded-tl-sm bg-muted/70 px-3 py-2 break-words whitespace-pre-wrap">
                  {entry.text}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-label="Message to judge" className="space-y-2">
        <h2 className="font-heading text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Judge this
        </h2>
        <div>
          <span className="font-heading font-semibold">{presentation.username}</span>
          <div className="mt-1">
            <TappableMessage
              text={presentation.text}
              spans={spans}
              onChange={setSpans}
              enabled={notOk}
            />
          </div>
        </div>
        {notOk ? (
          <p className="text-xs text-muted-foreground">
            Optional: tap words or phrases to flag them. Empty selection is fine.
          </p>
        ) : null}
      </section>

      <fieldset className="space-y-2">
        <legend className="font-heading text-sm font-semibold">Your judgment</legend>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Judgment">
          {(
            [
              ["fine", "Fine"],
              ["not_ok", "Not OK"],
              ["skip", "Skip"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              variant={action === value ? "default" : "outline"}
              aria-pressed={action === value}
              onClick={() => {
                setAction(value);
                setFormError(null);
                if (value !== "not_ok") {
                  setRule("");
                  setReason("");
                  setSpans([]);
                }
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </fieldset>

      {notOk ? (
        <div className="space-y-4 rounded-xl border border-border p-4">
          <div className="space-y-2">
            <label htmlFor="review-rule" className="text-sm font-medium">
              Rule
            </label>
            <select
              id="review-rule"
              className="flex h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={rule}
              onChange={(event) => setRule(event.target.value as CategoryId | "")}
            >
              <option value="">Choose a rule…</option>
              {REVIEW_RULE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Need a refresher? Open the <RulesLink className="text-xs" />.
            </p>
          </div>
          <div className="space-y-2">
            <label htmlFor="review-reason" className="text-sm font-medium">
              One-line reason
            </label>
            <Textarea
              id="review-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={280}
              rows={2}
              autoComplete="off"
              placeholder="How does it break the rule?"
            />
            <p className="text-xs text-muted-foreground">
              Example: “pro Al” is a sexual joke about the player Al.
            </p>
          </div>
        </div>
      ) : null}

      {formError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not submit</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={!action || submitting}
          onClick={() => void handleSubmit()}
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            "Submit review"
          )}
        </Button>
        <Button variant="outline" render={<Link href="/room" />}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
