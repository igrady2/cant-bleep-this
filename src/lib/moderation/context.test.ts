import { describe, expect, it } from "vitest";

import {
  MAX_CONTEXT_LINES,
  normalizeRoomContext,
  parseModerationRoomContext,
} from "./context";

describe("normalizeRoomContext", () => {
  it("keeps empty context and room lists", () => {
    expect(normalizeRoomContext([], [])).toEqual({ context: [], roomUsernames: [] });
  });

  it("trims lines and drops blank entries", () => {
    expect(
      normalizeRoomContext(
        [
          { username: " Player A ", text: " hi " },
          { username: "", text: "skip" },
          { username: "Player B", text: "" },
        ],
        [" Player C ", ""],
      ),
    ).toEqual({
      context: [{ username: "Player A", text: "hi" }],
      roomUsernames: ["Player C"],
    });
  });

  it(`keeps only the last ${MAX_CONTEXT_LINES} preceding messages`, () => {
    const lines = Array.from({ length: 12 }, (_, i) => ({
      username: `Player ${i}`,
      text: `line ${i}`,
    }));
    const normalized = normalizeRoomContext(lines, ["Player 0"]);
    expect(normalized.context).toHaveLength(MAX_CONTEXT_LINES);
    expect(normalized.context[0]).toEqual({ username: "Player 2", text: "line 2" });
    expect(normalized.context.at(-1)).toEqual({ username: "Player 11", text: "line 11" });
  });
});

describe("parseModerationRoomContext", () => {
  it("accepts omitted context fields", () => {
    expect(parseModerationRoomContext({ message: "hi" })).toEqual({
      ok: true,
      roomContext: { context: [], roomUsernames: [] },
    });
  });

  it("rejects too many context lines", () => {
    const context = Array.from({ length: MAX_CONTEXT_LINES + 1 }, () => ({
      username: "Player A",
      text: "x",
    }));
    const result = parseModerationRoomContext({ context });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at most 10/);
  });
});
