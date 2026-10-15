import type { MessageStatus } from "@/lib/messages/disposition";
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
  status: MessageStatus;
  slipRule?: string;
}

export type PostMessageApiBody =
  | {
      outcome: "off_limits";
      allowed: false;
      provider: ModerationResponse["provider"];
      crisisNote?: ModerationResponse["crisisNote"];
    }
  | (ModerationResponse & {
      message: string;
      filterOutcome: "passed" | "blocked";
      status: MessageStatus;
    });

export async function fetchRoomFeed(): Promise<
  { ok: true; messages: FeedMessage[] } | { ok: false; error: string }
> {
  const res = await fetch("/api/feed", { cache: "no-store" });
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


export interface ReviewPresentation {
  username: string;
  text: string;
  slipRule?: string;
  context: Array<{
    username: string;
    text: string;
    slipRule?: string;
    filterOutcome: string;
    status: MessageStatus;
  }>;
  reasons: string[];
  filterOutcome: string;
  status: MessageStatus;
}

export interface ReviewAssignmentResponse {
  assignmentId: string;
  assignment: "queue" | "hand_picked";
  messageId?: string;
  presentation: ReviewPresentation;
}

export async function fetchQueueAssignment(
  token: string,
): Promise<
  | { ok: true; data: ReviewAssignmentResponse }
  | { ok: false; error: string; status: number; code?: string }
> {
  const res = await fetch("/api/review/queue", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...playerAuthHeaders(token),
    },
    body: "{}",
  });
  const data = (await res.json().catch(() => null)) as
    | (ReviewAssignmentResponse & { error?: string; code?: string })
    | null;
  if (!res.ok || !data || !("assignmentId" in data)) {
    return {
      ok: false,
      status: res.status,
      error:
        (data && typeof data.error === "string" && data.error) ||
        "We could not load the next review. Please try again.",
      code: data && typeof data.code === "string" ? data.code : undefined,
    };
  }
  return { ok: true, data };
}

export async function fetchHandPickedAssignment(
  token: string,
  messageId: string,
): Promise<
  | { ok: true; data: ReviewAssignmentResponse }
  | { ok: false; error: string; status: number; code?: string }
> {
  const res = await fetch("/api/review/judge", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...playerAuthHeaders(token),
    },
    body: JSON.stringify({ messageId }),
  });
  const data = (await res.json().catch(() => null)) as
    | (ReviewAssignmentResponse & { error?: string; code?: string })
    | null;
  if (!res.ok || !data || !("assignmentId" in data)) {
    return {
      ok: false,
      status: res.status,
      error:
        (data && typeof data.error === "string" && data.error) ||
        "We could not open that message for review. Please try again.",
      code: data && typeof data.code === "string" ? data.code : undefined,
    };
  }
  return { ok: true, data };
}

export type ReviewSubmitAction = "fine" | "not_ok" | "skip";

export async function submitReviewRequest(
  token: string,
  body: {
    assignmentId: string;
    action: ReviewSubmitAction;
    rule?: string;
    reason?: string;
    flaggedSpans?: Array<{ start: number; end: number }>;
  },
): Promise<
  | { ok: true; reviewId: string; skipped: boolean }
  | { ok: false; error: string; status: number; code?: string }
> {
  const res = await fetch("/api/review/submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...playerAuthHeaders(token),
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as
    | { reviewId?: string; skipped?: boolean; error?: string; code?: string }
    | null;
  if (!res.ok || !data || typeof data.reviewId !== "string") {
    return {
      ok: false,
      status: res.status,
      error:
        (data && typeof data.error === "string" && data.error) ||
        "We could not save your review. Please try again.",
      code: data && typeof data.code === "string" ? data.code : undefined,
    };
  }
  return { ok: true, reviewId: data.reviewId, skipped: Boolean(data.skipped) };
}
