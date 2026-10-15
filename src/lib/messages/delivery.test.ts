import { describe, expect, it } from "vitest";

import {
  filterMessagesForFeed,
  filterMessagesForReviewQueue,
} from "./delivery";

describe("delivery filters", () => {
  const rows = [
    { id: "a", filterOutcome: "passed" as const, status: "pending" as const },
    { id: "b", filterOutcome: "blocked" as const, status: "pending" as const },
    { id: "c", filterOutcome: "passed" as const, status: "excluded" as const },
    { id: "d", filterOutcome: "off_limits" as const, status: "excluded" as const },
  ];

  it("keeps only feed-eligible passed rows", () => {
    expect(filterMessagesForFeed(rows).map((r) => r.id)).toEqual(["a"]);
  });

  it("drops excluded and off-limits rows from the review queue", () => {
    expect(filterMessagesForReviewQueue(rows).map((r) => r.id)).toEqual(["a", "b"]);
  });
});
