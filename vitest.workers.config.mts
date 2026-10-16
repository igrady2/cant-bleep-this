import { readFileSync } from "node:fs";
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
        // Baseline supported by the pinned test pool's workerd binary.
        d1Databases: ["REVIEWS_TEST_DB"],
        bindings: {
          CONSENSUS_SCHEMA: ["0001_initial_schema.sql", "0004_daily_post_caps.sql", "0005_hand_picked_reservations.sql", "0006_flagged_spans.sql", "0007_consensus_scores.sql", "0008_review_requirement.sql", "0009_seed_checks_standing.sql", "0011_test_case_capture.sql"].map((file) => readFileSync(new URL(`./migrations/${file}`, import.meta.url), "utf8")).join("\n"),
          CLAIM_CAP_SCHEMA: readFileSync(new URL("./migrations/0003_claim_cap_and_ban.sql", import.meta.url), "utf8"),
          REVIEW_REQUIREMENT_SCHEMA: readFileSync(new URL("./migrations/0008_review_requirement.sql", import.meta.url), "utf8"),
          FLAGGED_SPANS_SCHEMA: readFileSync(new URL("./migrations/0006_flagged_spans.sql", import.meta.url), "utf8"),
          REVIEW_ASSIGNMENTS_SCHEMA: readFileSync(
            new URL("./migrations/0005_hand_picked_reservations.sql", import.meta.url),
            "utf8",
          ),
        },
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
