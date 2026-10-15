import { claimUsername } from "@/lib/players/claim";
import { getPlayersDatabase, readWorkerSecret } from "@/lib/players/db";

export async function POST(request: Request) {
  const db = getPlayersDatabase();
  if (!db) {
    return Response.json(
      { error: "Username claims are only available in the deployed game environment." },
      { status: 503 },
    );
  }

  const turnstileSecret = readWorkerSecret("TURNSTILE_SECRET_KEY");
  const ipHashSalt = readWorkerSecret("IP_HASH_SALT");
  if (!turnstileSecret || !ipHashSalt) {
    console.error("[claim]", "missing TURNSTILE_SECRET_KEY or IP_HASH_SALT");
    return Response.json(
      { error: "Username claims are unavailable right now. Please try again." },
      { status: 503 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const { name, turnstileToken } = (payload ?? {}) as {
    name?: unknown;
    turnstileToken?: unknown;
  };
  if (typeof name !== "string" || typeof turnstileToken !== "string") {
    return Response.json({ error: "Send a username and verification token." }, { status: 400 });
  }

  const remoteIp = request.headers.get("cf-connecting-ip");
  const result = await claimUsername(db, {
    name,
    turnstileToken,
    remoteIp,
    turnstileSecret,
    ipHashSalt,
  });

  if (!result.ok) {
    const headers =
      result.status === 429 ? { "Retry-After": String(secondsUntilUtcMidnight()) } : undefined;
    return Response.json({ error: result.error }, { status: result.status, headers });
  }

  return Response.json({
    playerId: result.playerId,
    name: result.name,
    normalizedName: result.normalizedName,
    token: result.token,
  });
}

function secondsUntilUtcMidnight(): number {
  const now = new Date();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) / 1000;
  return Math.max(1, Math.ceil(midnight - now.getTime() / 1000));
}
