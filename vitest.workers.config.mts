import { fileURLToPath } from "node:url";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const CHAT_ROOM_CRISIS_NOTE_TEST = "src/components/chat/chat-room.crisis-note.test.ts";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2026-08-15",
        compatibilityFlags: ["nodejs_compat"],
      },
    }),
  ],
  test: {
    name: "workers",
    include: ["src/**/*.test.ts"],
    exclude: [CHAT_ROOM_CRISIS_NOTE_TEST],
  },
});
