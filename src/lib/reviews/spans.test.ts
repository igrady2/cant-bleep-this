import { expect, it } from "vitest";

import { parseAndValidateFlaggedSpans } from "./spans";

const len = "fuck this fuck".length;

it("accepts empty and omitted spans", () => {
  expect(parseAndValidateFlaggedSpans(undefined, len)).toEqual({ ok: true, spans: [] });
  expect(parseAndValidateFlaggedSpans([], len)).toEqual({ ok: true, spans: [] });
});

it("accepts object and pair forms for the first fuck only", () => {
  const first = { start: 0, end: 4 };
  expect(parseAndValidateFlaggedSpans([first], len)).toEqual({ ok: true, spans: [first] });
  expect(parseAndValidateFlaggedSpans([[0, 4]], len)).toEqual({ ok: true, spans: [first] });
});

it("rejects bare word strings and word fields", () => {
  expect(parseAndValidateFlaggedSpans(["fuck"], len).ok).toBe(false);
  expect(parseAndValidateFlaggedSpans([{ word: "fuck", start: 0, end: 4 }], len).ok).toBe(false);
});

it("rejects inverted, empty, and out-of-range spans", () => {
  expect(parseAndValidateFlaggedSpans([{ start: 4, end: 0 }], len).ok).toBe(false);
  expect(parseAndValidateFlaggedSpans([{ start: 2, end: 2 }], len).ok).toBe(false);
  expect(parseAndValidateFlaggedSpans([{ start: -1, end: 2 }], len).ok).toBe(false);
  expect(parseAndValidateFlaggedSpans([{ start: 0, end: len + 1 }], len).ok).toBe(false);
});

it("rejects extra object fields and excessive span counts", () => {
  expect(parseAndValidateFlaggedSpans([{ start: 0, end: 2, label: "extra" }], len).ok).toBe(false);
  expect(parseAndValidateFlaggedSpans(Array.from({ length: 141 }, () => [0, 1]), len).ok).toBe(false);
});
it("stores a sorted union of duplicate and overlapping spans", () => {
  expect(parseAndValidateFlaggedSpans([[5, 9], [0, 3], [2, 6], [0, 3]], len)).toEqual({
    ok: true, spans: [{ start: 0, end: 9 }],
  });
});
