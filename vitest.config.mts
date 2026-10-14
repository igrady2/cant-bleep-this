import { fileURLToPath } from "node:url";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next enforces this boundary in builds; tests already run server-side.
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  plugins: [cloudflareTest({
    miniflare: {
      // Baseline supported by the pinned test pool's workerd binary.
      compatibilityDate: "2026-08-15",
      compatibilityFlags: ["nodejs_compat"],
    },
  })],
  test: { include: ["src/**/*.test.ts"] },
});
