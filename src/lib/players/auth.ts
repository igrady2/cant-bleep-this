import "server-only";

import type { PlayersDatabase } from "./db";
import { hashPlayerToken } from "./crypto";

export interface AuthenticatedPlayer {
  id: string;
  name: string;
  normalizedName: string;
}

interface PlayerAuthRow {
  id: string;
  name: string;
  normalized_name: string;
  banned_at: number | null;
}

export type PlayerAuthResult =
  | { ok: true; player: AuthenticatedPlayer }
  | { ok: false; status: 401 | 403; error: string };

const BEARER_PREFIX = /^Bearer\s+(.+)$/i;

/** Reads the device token from Authorization: Bearer or X-Player-Token. */
export function readPlayerTokenFromRequest(request: Request): string | null {
  const headerToken = request.headers.get("x-player-token")?.trim();
  if (headerToken) return headerToken;

  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization) return null;
  const match = BEARER_PREFIX.exec(authorization);
  return match?.[1]?.trim() || null;
}

export async function authenticatePlayerToken(
  db: PlayersDatabase,
  token: string | null | undefined,
): Promise<PlayerAuthResult> {
  const trimmed = token?.trim();
  if (!trimmed) {
    return { ok: false, status: 401, error: "Sign in with your device token to continue." };
  }

  const tokenHash = await hashPlayerToken(trimmed);
  const row = await (
    db
      .prepare(
        "SELECT id, name, normalized_name, banned_at FROM players WHERE token_hash = ? LIMIT 1",
      )
      .bind(tokenHash) as { first<T>(): Promise<T | null> }
  ).first<PlayerAuthRow>();

  if (!row) {
    return { ok: false, status: 401, error: "That token is not valid." };
  }
  if (row.banned_at != null) {
    return { ok: false, status: 403, error: "That username cannot play right now." };
  }

  return {
    ok: true,
    player: {
      id: row.id,
      name: row.name,
      normalizedName: row.normalized_name,
    },
  };
}

/** For post/review routes (#10+): resolve the player or return a JSON error Response. */
export async function requireAuthenticatedPlayer(
  db: PlayersDatabase,
  request: Request,
): Promise<PlayerAuthResult | Response> {
  const auth = await authenticatePlayerToken(db, readPlayerTokenFromRequest(request));
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }
  return auth;
}
