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
  }
}

export async function isRateLimited(request: Request): Promise<boolean> {
  let env: CloudflareEnv;
  try {
    ({ env } = getCloudflareContext());
  } catch {
    // Not running on Workers (`next dev` / `next start`), so there are no bindings to enforce.
    return false;
  }

  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const perIp = await env.MODERATE_PER_IP_LIMITER?.limit({ key: ip });
  if (perIp && !perIp.success) return true;

  const global = await env.MODERATE_GLOBAL_LIMITER?.limit({ key: "global" });
  return global ? !global.success : false;
}
