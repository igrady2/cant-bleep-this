import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { MessagesDatabase } from "@/lib/messages/db";

export type ReviewsDatabase = MessagesDatabase;

export function getReviewsDatabase(): ReviewsDatabase | null {
  try {
    const { env } = getCloudflareContext();
    return (env as { DB?: ReviewsDatabase }).DB ?? null;
  } catch {
    return null;
  }
}
