"use client";

import { useSyncExternalStore } from "react";

import {
  hasAcknowledgedJudgeNotice,
  isAgeVerified,
  readStoredSession,
  type StoredPlayerSession,
} from "./storage";

export type SessionGateState =
  | { kind: "anonymous" }
  | { kind: "need_age"; session: StoredPlayerSession }
  | { kind: "need_notice"; session: StoredPlayerSession }
  | { kind: "ready"; session: StoredPlayerSession };

function readGateState(): SessionGateState {
  const session = readStoredSession();
  if (!session) return { kind: "anonymous" };
  if (!isAgeVerified()) return { kind: "need_age", session };
  if (!hasAcknowledgedJudgeNotice()) return { kind: "need_notice", session };
  return { kind: "ready", session };
}

const serverGate: SessionGateState = { kind: "anonymous" };

// useSyncExternalStore needs getSnapshot to return the same object until the
// underlying values change; a fresh object every call loops (React error #185).
let cachedKey: string | null = null;
let cachedGate: SessionGateState = serverGate;

function getGateSnapshot(): SessionGateState {
  const next = readGateState();
  const key =
    next.kind === "anonymous"
      ? next.kind
      : `${next.kind}|${next.session.token}|${next.session.playerId}|${next.session.name}`;
  if (key !== cachedKey) {
    cachedKey = key;
    cachedGate = next.kind === "anonymous" ? serverGate : next;
  }
  return cachedGate;
}

export function useSessionGate(): SessionGateState {
  return useSyncExternalStore(
    () => () => {},
    getGateSnapshot,
    () => serverGate,
  );
}
