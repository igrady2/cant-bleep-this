import { describe, expect, it, vi } from "vitest";

import { pickNextQueueTarget, pickRandomCandidate, pickUncertainCandidate } from "./queue";

describe("queue picks", () => {
  const base = {
    filter_outcome: "passed" as const,
    status: "pending" as const,
    created_at: 1,
  };

  it("prefers the smallest threshold gap for uncertain picks", () => {
    const candidates = [
      {
        ...base,
        id: "far",
        filter_scores: JSON.stringify({
          off_limits: 0.01,
          profanity: 0.1,
          bullying_harassment: 0.1,
          hate_speech: 0.1,
          sexual_content: 0.1,
          violence_threats: 0.1,
          self_harm: 0.1,
          personal_info: 0.1,
          spam: 0.1,
          impersonation: 0.1,
        }),
      },
      {
        ...base,
        id: "close",
        filter_scores: JSON.stringify({
          off_limits: 0.01,
          profanity: 0.49,
          bullying_harassment: 0.1,
          hate_speech: 0.1,
          sexual_content: 0.1,
          violence_threats: 0.1,
          self_harm: 0.1,
          personal_info: 0.1,
          spam: 0.1,
          impersonation: 0.1,
        }),
      },
    ];

    expect(pickUncertainCandidate(candidates)?.id).toBe("close");
  });

  it("random picks choose among all candidates", () => {
    const candidates = [
      { ...base, id: "a", filter_scores: "{}" },
      { ...base, id: "b", filter_scores: "{}" },
    ];
    vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
      (array as Uint32Array)[0] = 0xffffffff;
      return array;
    });
    expect(pickRandomCandidate(candidates)?.id).toBe("b");
    vi.restoreAllMocks();
  });
});

it("uses the default ten percent seed boundary and falls back when seeds are exhausted", async () => {
  const player = {id: "a", name: "a", normalizedName: "a"};
  let seedAvailable = true;
  const db = { prepare: (sql: string) => ({bind: () => ({all: async () =>
    sql.includes("FROM test_cases") ? (seedAvailable ? [{id: "seed"}] : []) :
    [{id: "real", filter_outcome: "passed", status: "pending", filter_scores: "{}", created_at: 0}],
  })}) } as unknown as import("./db").ReviewsDatabase;
  const rng = vi.spyOn(crypto, "getRandomValues").mockImplementation(array => {
    (array as Uint32Array)[0] = 0;
    return array;
  });
  expect(await pickNextQueueTarget(db, player)).toEqual({kind: "seed", seedCaseId: "seed"});
  rng.mockImplementation(array => { (array as Uint32Array)[0] = Math.ceil(0.1 * 2 ** 32); return array; });
  expect(await pickNextQueueTarget(db, player)).toEqual({kind: "message", messageId: "real"});
  seedAvailable = false;
  rng.mockImplementation(array => { (array as Uint32Array)[0] = 0; return array; });
  expect(await pickNextQueueTarget(db, player)).toEqual({kind: "message", messageId: "real"});
  vi.restoreAllMocks();
});

it("reads seed and message candidates from D1's { results } envelope", async () => {
  const player = {id: "a", name: "a", normalizedName: "a"};
  const db = { prepare: (sql: string) => ({bind: () => ({all: async () => ({success: true, results:
    sql.includes("FROM test_cases") ? [{id: "seed"}] :
    [{id: "real", filter_outcome: "passed", status: "pending", filter_scores: "{}", created_at: 0}],
  })})}) } as unknown as import("./db").ReviewsDatabase;
  const rng = vi.spyOn(crypto, "getRandomValues").mockImplementation(array => {
    (array as Uint32Array)[0] = 0;
    return array;
  });
  expect(await pickNextQueueTarget(db, player)).toEqual({kind: "seed", seedCaseId: "seed"});
  rng.mockImplementation(array => { (array as Uint32Array)[0] = Math.ceil(0.1 * 2 ** 32); return array; });
  expect(await pickNextQueueTarget(db, player)).toEqual({kind: "message", messageId: "real"});
  vi.restoreAllMocks();
});
