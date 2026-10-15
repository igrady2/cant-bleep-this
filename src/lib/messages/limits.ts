import "server-only";

export {
  FEED_MESSAGE_LIMIT,
  MESSAGE_MAX_LENGTH,
} from "./room-config";

/** PRD daily cap per player (UTC day). */
export const DAILY_POSTS_PER_PLAYER = 20;

/** PRD site-wide daily cap (UTC day). */
export const DAILY_POSTS_SITE_WIDE = 2000;

/** Fixed filter configuration id until #25 adds versioned configs. */
export const ACTIVE_FILTER_VERSION_ID = "v1";
