import { STORAGE_KEYS } from "./constants";

export interface StoredPlayerSession {
  token: string;
  playerId: string;
  name: string;
}

function storage(): Storage | null {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return null;
  }
  return window.localStorage;
}

export function readStoredSession(): StoredPlayerSession | null {
  const store = storage();
  if (!store) return null;
  const token = store.getItem(STORAGE_KEYS.deviceToken)?.trim();
  const playerId = store.getItem(STORAGE_KEYS.playerId)?.trim();
  const name = store.getItem(STORAGE_KEYS.playerName)?.trim();
  if (!token || !playerId || !name) return null;
  return { token, playerId, name };
}

export function writeStoredSession(session: StoredPlayerSession): void {
  const store = storage();
  if (!store) return;
  store.setItem(STORAGE_KEYS.deviceToken, session.token);
  store.setItem(STORAGE_KEYS.playerId, session.playerId);
  store.setItem(STORAGE_KEYS.playerName, session.name);
}

export function clearStoredSession(): void {
  const store = storage();
  if (!store) return;
  store.removeItem(STORAGE_KEYS.deviceToken);
  store.removeItem(STORAGE_KEYS.playerId);
  store.removeItem(STORAGE_KEYS.playerName);
}

export function isAgeVerified(): boolean {
  const store = storage();
  if (!store) return false;
  return store.getItem(STORAGE_KEYS.ageVerified) === "1";
}

export function setAgeVerified(): void {
  const store = storage();
  if (!store) return;
  store.setItem(STORAGE_KEYS.ageVerified, "1");
}

export function hasAcknowledgedJudgeNotice(): boolean {
  const store = storage();
  if (!store) return false;
  return store.getItem(STORAGE_KEYS.judgeNoticeAck) === "1";
}

export function acknowledgeJudgeNotice(): void {
  const store = storage();
  if (!store) return;
  store.setItem(STORAGE_KEYS.judgeNoticeAck, "1");
}

export function hasAcknowledgedRecoveryCode(playerId: string): boolean {
  const store = storage();
  if (!store) return false;
  return store.getItem(`${STORAGE_KEYS.recoveryAckPrefix}${playerId}`) === "1";
}

export function acknowledgeRecoveryCode(playerId: string): void {
  const store = storage();
  if (!store) return;
  store.setItem(`${STORAGE_KEYS.recoveryAckPrefix}${playerId}`, "1");
}
