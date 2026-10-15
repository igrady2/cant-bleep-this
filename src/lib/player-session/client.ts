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
