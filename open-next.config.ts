import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Pages are only prerendered at build time (no ISR or on-demand revalidation),
// so the read-only static assets cache is enough and no R2 bucket is needed.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
