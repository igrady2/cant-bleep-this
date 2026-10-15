import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_KEYS } from "./constants";
import {
  acknowledgeJudgeNotice,
  acknowledgeRecoveryCode,
  clearStoredSession,
  hasAcknowledgedJudgeNotice,
  hasAcknowledgedRecoveryCode,
  isAgeVerified,
  readStoredSession,
  setAgeVerified,
  writeStoredSession,
} from "./storage";

function mockLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
  vi.stubGlobal("window", { localStorage });
  return store;
}

describe("player session storage", () => {
  beforeEach(() => {
    mockLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a stored session", () => {
    writeStoredSession({ token: "tok", playerId: "p1", name: "Al" });
    expect(readStoredSession()).toEqual({ token: "tok", playerId: "p1", name: "Al" });
    clearStoredSession();
    expect(readStoredSession()).toBeNull();
  });

  it("tracks age, judge notice, and recovery acknowledgements", () => {
    expect(isAgeVerified()).toBe(false);
    setAgeVerified();
    expect(isAgeVerified()).toBe(true);

    expect(hasAcknowledgedJudgeNotice()).toBe(false);
    acknowledgeJudgeNotice();
    expect(hasAcknowledgedJudgeNotice()).toBe(true);

    expect(hasAcknowledgedRecoveryCode("p1")).toBe(false);
    acknowledgeRecoveryCode("p1");
    expect(hasAcknowledgedRecoveryCode("p1")).toBe(true);
    expect(window.localStorage.getItem(`${STORAGE_KEYS.recoveryAckPrefix}p1`)).toBe("1");
  });
});
