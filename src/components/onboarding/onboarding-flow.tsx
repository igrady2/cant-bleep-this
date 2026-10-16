"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { RulesLink } from "@/components/rules/rules-link";
import { TurnstileWidget } from "@/components/turnstile/turnstile-widget";
import { claimUsernameRequest, fetchPlayerProfile } from "@/lib/player-session/client";
import { JUDGE_CONTENT_NOTICE, TAGLINE } from "@/lib/player-session/constants";
import {
  acknowledgeJudgeNotice,
  acknowledgeRecoveryCode,
  hasAcknowledgedJudgeNotice,
  hasAcknowledgedRecoveryCode,
  setAgeVerified,
  writeStoredSession,
} from "@/lib/player-session/storage";
import { useSessionGate } from "@/lib/player-session/use-session-gate";
import {
  isBlockedWordUsername,
  isReservedUsername,
  isValidUsernameFormat,
} from "@/lib/players/policy";

type Step =
  | "landing"
  | "age"
  | "identity"
  | "recovery"
  | "judge_notice"
  | "entering";

function validateUsernameLocal(name: string): string | null {
  const trimmed = name.trim();
  if (!isValidUsernameFormat(trimmed)) {
    return "Use 3–20 characters: letters, numbers, and underscores only.";
  }
  if (isReservedUsername(trimmed)) {
    return "That username is reserved.";
  }
  if (isBlockedWordUsername(trimmed)) {
    return "That username is not allowed.";
  }
  return null;
}

export function OnboardingFlow() {
  const router = useRouter();
  const gate = useSessionGate();
  const [step, setStep] = useState<Step>("landing");
  const [username, setUsername] = useState("");
  const [restoreToken, setRestoreToken] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [pendingPlayerId, setPendingPlayerId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"claim" | "restore">("claim");

  const goToRoom = useCallback(() => {
    router.push("/room");
  }, [router]);

  const resumeStep = useMemo((): Step | null => {
    if (gate.kind === "need_age") return "age";
    if (gate.kind === "need_notice") return "judge_notice";
    return null;
  }, [gate.kind]);

  const activeStep = step === "landing" && resumeStep ? resumeStep : step;

  useEffect(() => {
    if (gate.kind === "ready") {
      router.replace("/room");
    }
  }, [gate.kind, router]);

  function afterSessionReady(playerId: string, showRecoveryIfNeeded: boolean) {
    if (showRecoveryIfNeeded && !hasAcknowledgedRecoveryCode(playerId)) {
      setStep("recovery");
      return;
    }
    if (!hasAcknowledgedJudgeNotice()) {
      setStep("judge_notice");
      return;
    }
    goToRoom();
  }

  async function handleClaim() {
    const localError = validateUsernameLocal(username);
    if (localError) {
      setError(localError);
      return;
    }
    if (!turnstileToken) {
      setError("Complete the verification check first.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await claimUsernameRequest(username.trim(), turnstileToken);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      setTurnstileToken(null);
      setTurnstileResetKey((key) => key + 1);
      return;
    }
    writeStoredSession({
      token: result.data.token,
      playerId: result.data.playerId,
      name: result.data.name,
    });
    setPendingPlayerId(result.data.playerId);
    setRecoveryCode(result.data.token);
    setStep("recovery");
  }

  async function handleRestore() {
    const token = restoreToken.trim();
    if (!token) {
      setError("Paste your recovery code.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await fetchPlayerProfile(token);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    writeStoredSession({
      token,
      playerId: result.data.playerId,
      name: result.data.name,
    });
    setPendingPlayerId(result.data.playerId);
    afterSessionReady(result.data.playerId, false);
  }

  function handleAgeConfirm() {
    setAgeVerified();
    if (gate.kind === "need_age" || gate.kind === "need_notice" || gate.kind === "ready") {
      afterSessionReady(gate.session.playerId, false);
    } else {
      setStep("identity");
    }
  }

  function handleRecoverySaved() {
    if (pendingPlayerId) {
      acknowledgeRecoveryCode(pendingPlayerId);
    }
    setRecoveryCode(null);
    if (!hasAcknowledgedJudgeNotice()) {
      setStep("judge_notice");
    } else {
      goToRoom();
    }
  }

  function handleJudgeNoticeContinue() {
    acknowledgeJudgeNotice();
    goToRoom();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
        {activeStep === "landing" && (
          <section className="flex flex-1 flex-col text-center">
            <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Can&apos;t Bleep This
            </h1>
            <p className="mt-3 text-lg text-brand-pink">{TAGLINE}</p>
            <p className="mt-6 text-pretty text-muted-foreground">
              A just-for-fun chat game. Post messages and try to get them past the filter while
              other players judge what slips through. Every verdict helps train a better filter.
            </p>
            <div className="mt-8 rounded-xl border border-border bg-muted/50 px-5 py-4 text-left text-sm">
              <p className="font-heading font-semibold">How it works</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Pick a username and join the shared room.</li>
                <li>Send up to 140 characters; the filter checks each message in context.</li>
                <li>Judge messages from the feed or review queue—Fine or Not OK with a rule.</li>
              </ul>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              Read the <RulesLink /> before you play.
            </p>
            <Button className="mt-8 w-full sm:w-auto" size="lg" onClick={() => setStep("age")}>
              Enter the room
            </Button>
          </section>
        )}

        {activeStep === "age" && (
          <section className="flex flex-1 flex-col">
            <h2 className="font-heading text-2xl font-semibold">Age confirmation</h2>
            <p className="mt-3 text-pretty text-muted-foreground">
              This game includes player-written chat that can be offensive. You must be{" "}
              <strong className="font-medium text-foreground">18 or older</strong> to enter the
              room.
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              See <RulesLink className="text-sm" /> for what is allowed.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={handleAgeConfirm}>
                I am 18 or older
              </Button>
              <Button variant="outline" size="lg" onClick={() => setStep("landing")}>
                Back
              </Button>
            </div>
          </section>
        )}

        {activeStep === "identity" && (
          <section className="flex flex-1 flex-col">
            <h2 className="font-heading text-2xl font-semibold">Choose your name</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Names are unique. You&apos;ll get a one-time recovery code to play on another device.
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                variant={mode === "claim" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setMode("claim");
                  setError(null);
                }}
              >
                New name
              </Button>
              <Button
                variant={mode === "restore" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setMode("restore");
                  setError(null);
                }}
              >
                Restore with code
              </Button>
            </div>

            {mode === "claim" ? (
              <form
                className="mt-6 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleClaim();
                }}
              >
                <label className="block text-sm font-medium">
                  Username
                  <input
                    className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="off"
                    maxLength={20}
                    disabled={busy}
                  />
                </label>
                <TurnstileWidget onToken={setTurnstileToken} resetKey={turnstileResetKey} />
                {error && (
                  <Alert variant="destructive">
                    <AlertTitle>Could not claim name</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" size="lg" disabled={busy}>
                  {busy ? "Claiming…" : "Claim username"}
                </Button>
              </form>
            ) : (
              <form
                className="mt-6 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleRestore();
                }}
              >
                <label className="block text-sm font-medium">
                  Recovery code
                  <textarea
                    className="mt-1.5 min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    value={restoreToken}
                    onChange={(event) => setRestoreToken(event.target.value)}
                    autoComplete="off"
                    disabled={busy}
                    placeholder="Paste the code you saved when you claimed your name"
                  />
                </label>
                {error && (
                  <Alert variant="destructive">
                    <AlertTitle>Could not restore</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" size="lg" disabled={busy}>
                  {busy ? "Checking…" : "Restore name"}
                </Button>
              </form>
            )}
          </section>
        )}

        {activeStep === "recovery" && recoveryCode && (
          <section className="flex flex-1 flex-col">
            <h2 className="font-heading text-2xl font-semibold">Save your recovery code</h2>
            <p className="mt-3 text-pretty text-muted-foreground">
              This code is shown once. Save it somewhere safe to play as the same name on another
              device. If you lose it, pick a new name.
            </p>
            <pre
              className="mt-6 overflow-x-auto rounded-xl border border-border bg-muted/60 p-4 font-mono text-xs break-all whitespace-pre-wrap"
              aria-label="Recovery code"
            >
              {recoveryCode}
            </pre>
            <Button className="mt-6" size="lg" onClick={handleRecoverySaved}>
              I saved my code
            </Button>
          </section>
        )}

        {activeStep === "judge_notice" && (
          <section className="flex flex-1 flex-col">
            <h2 className="font-heading text-2xl font-semibold">Before you judge</h2>
            <p className="mt-4 text-pretty text-muted-foreground">{JUDGE_CONTENT_NOTICE}</p>
            <p className="mt-4 text-sm text-muted-foreground">
              Reviewers can open the <RulesLink className="text-sm" /> to check a rule before
              choosing it.
            </p>
            <Button className="mt-8" size="lg" onClick={handleJudgeNoticeContinue}>
              Continue to the room
            </Button>
          </section>
        )}

        {activeStep === "entering" && (
          <p className="text-center text-muted-foreground">Opening the room…</p>
        )}
      </div>
    </div>
  );
}
