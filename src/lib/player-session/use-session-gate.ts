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

export function useSessionGate(): SessionGateState {
  return useSyncExternalStore(
    () => () => {},
    readGateState,
    () => serverGate,
  );
}
