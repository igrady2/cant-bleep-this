import "server-only";

import type { PlayersDatabase } from "./db";
import { generatePlayerToken, hashIpForClaimCap, hashPlayerToken, utcClaimDay } from "./crypto";
import { validateUsernameForClaim } from "./validate";
import { verifyTurnstileToken } from "./turnstile";

export const DAILY_CLAIMS_PER_IP = 3;

export type ClaimUsernameInput = {
  name: string;
  turnstileToken: string;
  remoteIp: string | null;
  turnstileSecret: string;
  ipHashSalt: string;
  fetchImpl?: typeof fetch;
};

export type ClaimUsernameResult =
  | {
      ok: true;
      playerId: string;
      name: string;
      normalizedName: string;
      token: string;
    }
  | { ok: false; status: number; error: string; code?: string };

function isUniqueConstraintError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /unique|constraint/i.test(message);
}

export async function claimUsername(
  db: PlayersDatabase,
  input: ClaimUsernameInput,
): Promise<ClaimUsernameResult> {
  const turnstile = await verifyTurnstileToken(
    input.turnstileToken,
    input.turnstileSecret,
    input.remoteIp,
    input.fetchImpl,
  );
  if (!turnstile.ok) {
    return { ok: false, status: 400, error: turnstile.error, code: "turnstile" };
  }

  const validation = await validateUsernameForClaim(input.name);
  if (!validation.ok) {
    const status = validation.code === "provider_unavailable" ? 503 : 400;
    return { ok: false, status, error: validation.error, code: validation.code };
  }

  const ip = input.remoteIp?.trim() || "unknown";
  const ipHash = await hashIpForClaimCap(ip, input.ipHashSalt);
  const day = utcClaimDay();
  const playerId = crypto.randomUUID();
  const token = generatePlayerToken();
  const tokenHash = await hashPlayerToken(token);
  const now = Math.floor(Date.now() / 1000);

  // last_played_at starts at the claim time, so a name that never posts is
  // released by the nightly retention cron 90 days after the claim (#27).
  const insertPlayer = db
    .prepare(
      `INSERT INTO players (
        id, name, normalized_name, token_hash, created_at, last_played_at, reviewer_standing
      ) VALUES (?, ?, ?, ?, ?, ?, 'good')`,
    )
    .bind(playerId, validation.name, validation.normalizedName, tokenHash, now, now);

  const bumpIpClaims = db
    .prepare(
      `INSERT INTO ip_daily_claims (ip_hash, day, claim_count) VALUES (?, ?, 1)
       ON CONFLICT(ip_hash, day) DO UPDATE SET claim_count = claim_count + 1`,
    )
    .bind(ipHash, day);

  try {
    await db.batch([insertPlayer, bumpIpClaims]);
  } catch (err) {
    console.error("[claim]", err);
    if (isUniqueConstraintError(err)) {
      const taken = await (
        db
          .prepare("SELECT 1 FROM players WHERE normalized_name = ? LIMIT 1")
          .bind(validation.normalizedName) as { first<T>(): Promise<T | null> }
      ).first<{ 1: number }>();
      if (taken) {
        return {
          ok: false,
          status: 409,
          error: "That username is already taken. Pick another one.",
          code: "taken",
        };
      }
      return {
        ok: false,
        status: 429,
        error: "You have claimed too many names today. Try again tomorrow.",
        code: "ip_cap",
      };
    }
    return {
      ok: false,
      status: 503,
      error: "We could not save your username right now. Please try again.",
    };
  }

  return {
    ok: true,
    playerId,
    name: validation.name,
    normalizedName: validation.normalizedName,
    token,
  };
}
