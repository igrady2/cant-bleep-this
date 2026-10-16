import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SuccessMetrics } from "@/lib/admin/metrics";
import { MetricsPanel } from "./metrics-panel";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const rate = { value: 0.5, numeratorCount: 1, denominatorCount: 2, numerator: "caught", denominator: "Not OK verdicts", window: "last 28d" };
const bucket = { label: "Early two-vote verdicts", decided: 2, slip: 1, clean: 0, caught: 1, falsePositive: 0 };
const metrics: SuccessMetrics = {
  generatedAt: 1, window: { days: 28, start: 0, end: 1, label: "last 28d" },
  verdicts: { window: "last 28d", reviewable: 4, pending: 1, decided: 3, buckets: {
    twoVote: bucket, threeReview: { ...bucket, label: "Three-review verdicts", decided: 1 }, other: { ...bucket, decided: 0 },
  } },
  catchRate: { ...rate, byBucket: { twoVote: rate, threeReview: rate } },
  falsePositiveRate: { ...rate, value: null, byBucket: { twoVote: rate, threeReview: rate } },
  threeReviewAgreement: rate,
  confirmedSlipsPerWeek: { window: "last 28d", numerator: "confirmed slips", denominator: "ISO week", total: 1, weeks: [{ week: "2026-W42", slips: 1, partial: true }] },
  confirmedToPatched: { window: "last 28d", denominator: "patched confirmed slips", medianSeconds: 86400, patched: 1, unpatched: 2, withinTarget: 1, targetSeconds: 1209600 },
  usage: { window: "last 28d", jevChecks: { total: 5, posts: 4, nameClaims: 1, denominator: "stored checks", window: "last 28d" },
    cost: { perCheckUsd: 0.0002, rateSource: "default", estimatedUsd: 0.001, projected30DayUsd: 0.001071, denominator: "stored checks", window: "last 28d" },
    d1: { posts: { total: 4, perDay: 0.14, peakDay: 4 }, reviews: { total: 3, perDay: 0.11, peakDay: 3 }, estimatedRowsWrittenPeakDay: 16, reportRowsRead: 100 },
    freePlan: { limits: { d1RowsReadPerDay: 5000000, d1RowsWrittenPerDay: 100000, workerRequestsPerDay: 100000 }, notes: ["Worker requests: check Cloudflare dashboard."] },
  },
};
it("loads the guarded report and shows rates, buckets, patch times and usage", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ metrics }));
  vi.stubGlobal("fetch", fetchMock);
  render(<MetricsPanel />);
  expect(await screen.findByText("Early two-vote verdicts: 2")).toBeTruthy();
  expect(screen.getByText("Three-review verdicts: 1")).toBeTruthy();
  expect(screen.getByText(/2026-W42: 1 \(partial week\)/)).toBeTruthy();
  expect(screen.getByText(/Median: 1.0 days. 1 patched; 2 unpatched/)).toBeTruthy();
  expect(screen.getByText(/5 stored Jev checks/)).toBeTruthy();
  expect(screen.getAllByText(/Not OK verdicts; last 28d/).length).toBeGreaterThan(0);
  expect(fetchMock).toHaveBeenCalledWith("/api/admin/metrics?days=28", expect.objectContaining({ cache: "no-store" }));
  await userEvent.selectOptions(screen.getByLabelText("Reporting window"), "7");
  expect(fetchMock).toHaveBeenLastCalledWith("/api/admin/metrics?days=7", expect.objectContaining({ cache: "no-store" }));
});
it("shows an actionable error when the report fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
  render(<MetricsPanel />);
  expect((await screen.findByRole("alert")).textContent).toContain("Please reload");
});
