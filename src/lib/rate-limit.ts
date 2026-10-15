import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

// Workers Rate Limiting binding (configured under "ratelimits" in wrangler.jsonc).
interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

declare global {
  interface CloudflareEnv {
    MODERATE_PER_IP_LIMITER?: RateLimiter;
    MODERATE_GLOBAL_LIMITER?: RateLimiter;
    REVIEW_PER_IP_LIMITER?: RateLimiter;
    REVIEW_GLOBAL_LIMITER?: RateLimiter;
  }
}

async function isLimitedByBindings(
  request: Request,
  perIpBinding: RateLimiter | undefined,
  globalBinding: RateLimiter | undefined,
  globalKey: string,
): Promise<boolean> {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const perIp = await perIpBinding?.limit({ key: ip });
  if (perIp && !perIp.success) return true;

  const global = await globalBinding?.limit({ key: globalKey });
  return global ? !global.success : false;
}

export async function isRateLimited(request: Request): Promise<boolean> {
  try {
    const { env } = getCloudflareContext();
    return isLimitedByBindings(
      request,
      env.MODERATE_PER_IP_LIMITER,
      env.MODERATE_GLOBAL_LIMITER,
      "moderate-global",
    );
  } catch {
    return false;
  }
}

// Follow-up: add a per-player limit after authentication in queue and judge routes.
export async function isReviewRateLimited(request: Request): Promise<boolean> {
  try {
    const { env } = getCloudflareContext();
    return isLimitedByBindings(
      request,
      env.REVIEW_PER_IP_LIMITER,
      env.REVIEW_GLOBAL_LIMITER,
      "review-global",
    );
  } catch {
    return false;
  }
}
