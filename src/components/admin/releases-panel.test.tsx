import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FilterRelease } from "@/lib/filter-release/releases";
import { ReleasesPanel } from "./releases-panel";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const DAY = 24 * 60 * 60;
const release = (version: string, overrides: Partial<FilterRelease> = {}): FilterRelease => ({
  version,
  releasedAt: Date.UTC(2026, 9, 20, 15, 30) / 1000,
  baselineVersion: "v1",
  catches: 12,
  baselineCatches: 9,
  falsePositives: 2,
  baselineFalsePositives: 2,
  patchedSlips: 3,
  patchTime: { measured: 2, medianSeconds: 4.5 * DAY, withinTarget: 2 },
  ...overrides,
});

it("lists releases with gate counts and patch time", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ releases: [release("v2")] })));
  render(<ReleasesPanel />);
  const [item] = await screen.findAllByTestId("release");
  expect(item.textContent).toContain("Released 2026-10-20 15:30 UTC");
  expect(item.textContent).toContain("catches 9 → 12");
  expect(item.textContent).toContain("Patched 3 slips");
  expect(item.textContent).toContain("Median patch time 4.5 days; 2 of 2 timed within 2 weeks.");
});

it("shows when nothing has been released", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ releases: [] })));
  render(<ReleasesPanel />);
  expect(await screen.findByText("No releases recorded yet.")).toBeTruthy();
});

it("uploads a report and shows the new release", async () => {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST"
    ? Response.json({ release: release("v3", { patchedSlips: 1 }) }, { status: 201 })
    : Response.json({ releases: [release("v2")] }));
  vi.stubGlobal("fetch", fetchMock);
  render(<ReleasesPanel />);
  await screen.findAllByTestId("release");
  const file = new File(['{"reportVersion":1}'], "filter-release-v2-to-v3.json", { type: "application/json" });
  await userEvent.upload(screen.getByLabelText(/Release report/), file);
  expect((await screen.findByRole("status")).textContent).toBe("Recorded v3: 1 slip patched.");
  expect(fetchMock).toHaveBeenLastCalledWith("/api/admin/releases", expect.objectContaining({
    method: "POST", body: '{"reportVersion":1}',
  }));
  expect(screen.getAllByTestId("release").map((item) => item.querySelector("h3")?.textContent)).toEqual(["v3", "v2"]);
});

it("shows why a report was refused", async () => {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST"
    ? Response.json({ error: "The report's release gate did not pass." }, { status: 400 })
    : Response.json({ releases: [] })));
  render(<ReleasesPanel />);
  await screen.findByText("No releases recorded yet.");
  await userEvent.upload(screen.getByLabelText(/Release report/), new File(["{}"], "r.json", { type: "application/json" }));
  expect((await screen.findByRole("alert")).textContent).toBe("The report's release gate did not pass.");
});
