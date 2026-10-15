import type { ModerationResponse } from "@/lib/moderation/types";

export interface ClaimSuccess {
  playerId: string;
  name: string;
  normalizedName: string;
  token: string;
}

export interface PlayerProfile {
  playerId: string;
  name: string;
  normalizedName: string;
}

function playerAuthHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "X-Player-Token": token,
  };
}

export async function claimUsernameRequest(
  name: string,
  turnstileToken: string,
): Promise<{ ok: true; data: ClaimSuccess } | { ok: false; error: string }> {
  const res = await fetch("/api/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, turnstileToken }),
  });
  const data = (await res.json().catch(() => null)) as ClaimSuccess | { error?: string } | null;
  if (!res.ok || !data || !("token" in data)) {
    return {
      ok: false,
      error:
        (data && "error" in data && typeof data.error === "string" && data.error) ||
        "We couldn't claim that username. Please try again.",
    };
  }
  return { ok: true, data };
}

export interface FeedMessage {
  id: string;
  author: string;
  text: string;
  createdAt: number;
  status: string;
  slipRule?: string;
}

export type PostMessageApiBody =
  | {
      outcome: "off_limits";
      allowed: false;
      provider: ModerationResponse["provider"];
    }
  | (ModerationResponse & {
      message: string;
      filterOutcome: "passed" | "blocked";
      status: string;
    });

export async function fetchRoomFeed(): Promise<
  { ok: true; messages: FeedMessage[] } | { ok: false; error: string }
> {
  const res = await fetch("/api/feed");
  const data = (await res.json().catch(() => null)) as
    | { messages?: FeedMessage[]; error?: string }
    | null;
  if (!res.ok || !data || !Array.isArray(data.messages)) {
    return {
      ok: false,
      error:
        (data && typeof data.error === "string" && data.error) ||
        "We could not load the room feed right now. Please try again.",
    };
  }
  return { ok: true, messages: data.messages };
}

export async function postMessageRequest(
  token: string,
  message: string,
  idempotencyKey: string,
): Promise<
  | { ok: true; id: string; body: PostMessageApiBody }
  | { ok: false; error: string; status: number; code?: string }
> {
  const res = await fetch("/api/post", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...playerAuthHeaders(token),
    },
    body: JSON.stringify({ message, idempotencyKey }),
  });
  const data = (await res.json().catch(() => null)) as
    | ({ id?: string } & PostMessageApiBody & { error?: string; code?: string })
    | null;
  if (!res.ok || !data) {
    return {
      ok: false,
      status: res.status,
      error:
        (data && typeof data.error === "string" && data.error) ||
        "Something went wrong while posting your message. Please try again.",
      code: data && typeof data.code === "string" ? data.code : undefined,
    };
  }
  if (!data.id) {
    return {
      ok: false,
      status: 500,
      error: "Something went wrong while posting your message. Please try again.",
    };
  }
  return { ok: true, id: data.id, body: data };
}

export async function fetchPlayerProfile(
  token: string,
): Promise<{ ok: true; data: PlayerProfile } | { ok: false; error: string }> {
  const res = await fetch("/api/player", {
    method: "GET",
    headers: playerAuthHeaders(token),
  });
  const data = (await res.json().catch(() => null)) as PlayerProfile | { error?: string } | null;
  if (!res.ok || !data || !("playerId" in data)) {
    return {
      ok: false,
      error:
        (data && "error" in data && typeof data.error === "string" && data.error) ||
        "That recovery code is not valid.",
    };
  }
  return { ok: true, data };
}
