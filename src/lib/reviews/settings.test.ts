import { afterEach, expect, it, vi } from "vitest";
import { queueSeedFraction, seedStandingWindow, seedStandingMisses, reviewRequirementTiers } from "./settings";
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("defaults to one seed in ten and three misses in ten", () => {
  expect(queueSeedFraction()).toBe(0.1);
  expect(seedStandingWindow()).toBe(10);
  expect(seedStandingMisses()).toBe(3);
});
it("warns only once per invalid setting without logging its value", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubEnv("REVIEW_SEED_WINDOW", "invalid");
  expect(seedStandingWindow()).toBe(10); seedStandingWindow();
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0][0]).not.toContain("invalid");
  vi.stubEnv("REVIEW_REQUIREMENT_TIERS", "bad");
  reviewRequirementTiers(); reviewRequirementTiers();
  expect(warn).toHaveBeenCalledTimes(2);
});
