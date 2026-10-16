"use client";

import { useEffect, useId, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        },
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve) => {
      const done = () => resolve();
      if (window.turnstile) {
        done();
        return;
      }
      window.onTurnstileLoad = done;
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      window.onTurnstileLoad?.();
      resolve();
    };
    script.onerror = () => reject(new Error("Turnstile failed to load."));
    document.head.appendChild(script);
    window.onTurnstileLoad = () => resolve();
  });
}

export function TurnstileWidget({
  onToken,
  onError,
  className,
  resetKey = 0,
}: {
  onToken: (token: string | null) => void;
  onError?: () => void;
  className?: string;
  /** Change this to issue a fresh challenge, e.g. after the server spent the last token. */
  resetKey?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);
  const reactId = useId();
  const [scriptError, setScriptError] = useState<string | null>(null);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const configError = siteKey
    ? null
    : "Verification is not configured for this environment.";

  useEffect(() => {
    onTokenRef.current = onToken;
    onErrorRef.current = onError;
  }, [onError, onToken]);

  useEffect(() => {
    if (!siteKey) return;

    let cancelled = false;

    void loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "auto",
          callback: (token) => onTokenRef.current(token),
          "error-callback": () => {
            onTokenRef.current(null);
            onErrorRef.current?.();
          },
          "expired-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => {
        setScriptError("Verification could not load. Check your connection and try again.");
        onTokenRef.current(null);
        onErrorRef.current?.();
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  // Turnstile tokens are single-use. After a failed claim the server has
  // already redeemed the token, so the widget must run a new challenge.
  useEffect(() => {
    if (resetKey === 0) return;
    onTokenRef.current(null);
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [resetKey]);

  const displayError = configError ?? scriptError;
  if (displayError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {displayError}
      </p>
    );
  }

  return <div ref={containerRef} className={className} data-turnstile={reactId} />;
}
