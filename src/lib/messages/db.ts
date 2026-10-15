import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Minimal D1 surface for message persistence (#13+). */
export interface MessagesDatabase {
  prepare(query: string): {
    bind(...values: unknown[]): MessagesStatement;
  };
  batch(statements: MessagesStatement[]): Promise<unknown[]>;
}

export interface MessagesStatement {
  first?<T>(): Promise<T | null>;
  run?(): Promise<{ success?: boolean; meta?: { changes?: number } }>;
  all?<T>(): Promise<T[]>;
  sql?: string;
  args?: unknown[];
}

export function getMessagesDatabase(): MessagesDatabase | null {
  try {
    const { env } = getCloudflareContext();
    return (env as { DB?: MessagesDatabase }).DB ?? null;
  } catch {
    return null;
  }
}
