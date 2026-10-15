"use client";

import { HeartHandshake, X } from "lucide-react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { SelfHarmCrisisNote } from "@/lib/content/self-harm-crisis-note";

export function SelfHarmCrisisNoteBanner({
  note,
  onDismiss,
}: {
  note: SelfHarmCrisisNote;
  onDismiss: () => void;
}) {
  return (
    <Alert className="border-primary/25 bg-primary/5">
      <HeartHandshake className="text-primary" aria-hidden />
      <AlertTitle className="font-heading text-base text-foreground">
        You&apos;re not alone
      </AlertTitle>
      <AlertDescription className="space-y-2 text-pretty">
        <p>{note.message}</p>
        <p className="text-sm">
          Call or text{" "}
          <a
            href={`tel:${note.phone}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {note.phone}
          </a>{" "}
          (988 Suicide &amp; Crisis Lifeline) or visit{" "}
          <a
            href={note.websiteUrl}
            className="font-medium text-primary underline-offset-4 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {note.websiteLabel}
          </a>
          .
        </p>
      </AlertDescription>
      <AlertAction>
        <Button size="icon-sm" variant="ghost" onClick={onDismiss} aria-label="Dismiss">
          <X />
        </Button>
      </AlertAction>
    </Alert>
  );
}
