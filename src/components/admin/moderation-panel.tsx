"use client";

import { useEffect, useState } from "react";

type Message = { id: string; playerId: string; name: string; text: string; bannedAt: number | null };

export function ModerationPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/moderation", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setMessages((await response.json() as { messages: Message[] }).messages);
      }).catch(() => { if (!controller.signal.aborted) setError("Could not load moderation messages."); });
    return () => controller.abort();
  }, []);
  async function act(action: "delete_message" | "ban_player", targetId: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/moderation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, targetId }),
      });
      if (!response.ok) throw new Error();
      setMessages((current) => action === "delete_message"
        ? current.filter((message) => message.id !== targetId)
        : current.map((message) => message.playerId === targetId ? { ...message, bannedAt: 1 } : message));
    } catch { setError("Could not save moderation action. Try again."); }
    finally { setBusy(false); }
  }
  return <section className="mt-8" aria-label="Moderation">
    <h2 className="text-xl font-semibold">Message and username moderation</h2>
    <p className="mt-2 text-sm text-muted-foreground">Deleting removes the message, its slip point and its saved test case. Banning blocks play and hides the name from the board; anonymized cases stay.</p>
    {error && <p role="alert">{error}</p>}
    <ul className="mt-4 space-y-3">{messages.map((message) => <li key={message.id} className="rounded-lg border p-4">
      <p><strong>{message.name}</strong>: {message.text}</p>
      <div className="mt-2 flex gap-4">
        <button disabled={busy} onClick={() => void act("delete_message", message.id)}>Delete message</button>
        <button disabled={busy || message.bannedAt !== null} onClick={() => void act("ban_player", message.playerId)}>{message.bannedAt !== null ? "Banned" : "Ban username"}</button>
      </div>
    </li>)}</ul>
  </section>;
}
