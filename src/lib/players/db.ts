import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Minimal D1 surface for player claim and token auth (#9). */
export interface PlayersDatabase {
  prepare(query: string): {
    bind(...values: unknown[]): PlayersStatement;
  };
  batch(statements: PlayersStatement[]): Promise<unknown[]>;
}

export interface PlayersStatement {
  first?<T>(): Promise<T | null>;
  run?(): Promise<{ success?: boolean; meta?: { changes?: number } }>;
  sql?: string;
  args?: unknown[];
}

declare global {
  interface CloudflareEnv {
    TURNSTILE_SECRET_KEY?: string;
    IP_HASH_SALT?: string;
  }
}

export function getPlayersDatabase(): PlayersDatabase | null {
  try {
    const { env } = getCloudflareContext();
    return (env as { DB?: PlayersDatabase }).DB ?? null;
  } catch {
    return null;
  }
}

export function readWorkerSecret(name: "TURNSTILE_SECRET_KEY" | "IP_HASH_SALT"): string | null {
  try {
    const { env } = getCloudflareContext();
    const fromBinding = (env as CloudflareEnv)[name]?.trim();
    if (fromBinding) return fromBinding;
  } catch {
    // `next dev` has no Worker bindings; fall through to process.env.
  }
  const fromEnv = process.env[name]?.trim();
  return fromEnv || null;
}
