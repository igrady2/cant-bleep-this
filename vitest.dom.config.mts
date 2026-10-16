import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    name: "dom",
    include: ["src/components/chat/chat-room.crisis-note.test.ts", "src/components/judge/*.test.tsx", "src/components/chat/message-list.test.tsx", "src/app/board/*.test.tsx", "src/components/admin/*.test.tsx", "src/components/turnstile/*.test.tsx"],
    environment: "happy-dom",
  },
});
