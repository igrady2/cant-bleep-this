import "server-only";

import { utcClaimDay } from "@/lib/players/crypto";
import {
  DAILY_POSTS_PER_PLAYER,
  DAILY_POSTS_SITE_WIDE,
} from "./limits";
import type { MessagesDatabase } from "./db";

export type DailyPostCapCode = "player_cap" | "site_cap";

const PLAYER_CAP_CHECK = new RegExp(
  `CHECK constraint failed:.*post_count\\s*>=\\s*0\\s+AND\\s+post_count\\s*<=\\s*${DAILY_POSTS_PER_PLAYER}`,
  "i",
);
const SITE_CAP_CHECK = new RegExp(
  `CHECK constraint failed:.*post_count\\s*>=\\s*0\\s+AND\\s+post_count\\s*<=\\s*${DAILY_POSTS_SITE_WIDE}`,
  "i",
);

export function dailyPostCapFailure(
  code: DailyPostCapCode,
): { ok: false; status: 429; error: string; code: DailyPostCapCode } {
  return {
    ok: false,
    status: 429,
    error:
      code === "site_cap"
        ? "The room has reached today's posting limit. Try again tomorrow."
        : "You have reached today's posting limit. Try again tomorrow.",
    code,
  };
}

/** Maps SQLite/D1 CHECK failures on post_count to player vs site caps. */
export function parseDailyCapCheckError(
  err: unknown,
): ReturnType<typeof dailyPostCapFailure> | null {
  const message = err instanceof Error ? err.message : String(err);
  if (SITE_CAP_CHECK.test(message)) {
    return dailyPostCapFailure("site_cap");
  }
  if (PLAYER_CAP_CHECK.test(message)) {
    return dailyPostCapFailure("player_cap");
  }
  return null;
}

interface CountRow {
  post_count: number;
}

export async function findDailyPostCapBlock(
  db: MessagesDatabase,
  playerId: string,
  unixSeconds = Math.floor(Date.now() / 1000),
): Promise<ReturnType<typeof dailyPostCapFailure> | null> {
  const day = utcClaimDay(unixSeconds);

  const playerRow = await (
    db
      .prepare(
        "SELECT post_count FROM player_daily_posts WHERE player_id = ? AND day = ? LIMIT 1",
      )
      .bind(playerId, day) as { first<T>(): Promise<T | null> }
  ).first<CountRow>();

  if (playerRow && playerRow.post_count >= DAILY_POSTS_PER_PLAYER) {
    return dailyPostCapFailure("player_cap");
  }

  const siteRow = await (
    db
      .prepare("SELECT post_count FROM site_daily_posts WHERE day = ? LIMIT 1")
      .bind(day) as { first<T>(): Promise<T | null> }
  ).first<CountRow>();

  if (siteRow && siteRow.post_count >= DAILY_POSTS_SITE_WIDE) {
    return dailyPostCapFailure("site_cap");
  }

  return null;
}
