import { readStoredSession } from "./storage";

function key() { return `pending-draft:${readStoredSession()?.playerId ?? "anonymous"}`; }

export function readPendingDraft(): string {
  try { return window.sessionStorage.getItem(key()) ?? ""; } catch { return ""; }
}

export function savePendingDraft(text: string): void {
  try {
    if (text) window.sessionStorage.setItem(key(), text);
    else window.sessionStorage.removeItem(key());
  } catch { /* Keep the in-memory draft if browser storage is unavailable. */ }
}
