import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import BoardPage from "./page";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("shows loading before the board arrives", () => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  render(<BoardPage />);
  expect(screen.getByRole("status").textContent).toBe("Loading leaderboard…");
});
it("shows names and unweighted counts in API order", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ players: [
    { name: "Alice", slips: 12 }, { name: "Bob", slips: 12 }, { name: "Charlie", slips: 2 },
  ] })));
  render(<BoardPage />);
  await screen.findByRole("table");
  const rows = screen.getAllByRole("row");
  expect(rows[1].textContent).toBe("1Alice12");
  expect(rows[2].textContent).toBe("1Bob12");
  expect(rows[3].textContent).toBe("3Charlie2");
  expect(screen.getByText("Ties sort by player name.")).toBeTruthy();
});
it("shows an empty board", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ players: [] })));
  render(<BoardPage />);
  expect(await screen.findByText(/No confirmed slips/)).toBeTruthy();
});
it("shows an error when the API is unavailable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
  render(<BoardPage />);
  expect((await screen.findByRole("alert")).textContent).toContain("unavailable");
});
it("lists released versions and the slips they patched", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
    players: [{ name: "Alice", slips: 3 }],
    releases: [
      { version: "v3", releasedAt: Date.UTC(2026, 10, 2) / 1000, patchedSlips: 1 },
      { version: "v2", releasedAt: Date.UTC(2026, 9, 20) / 1000, patchedSlips: 4 },
    ],
  })));
  render(<BoardPage />);
  await screen.findByRole("table");
  const items = screen.getAllByRole("listitem");
  expect(items.map((item) => item.textContent)).toEqual([
    "Patched in v31 slip · released 2026-11-02 UTC",
    "Patched in v24 slips · released 2026-10-20 UTC",
  ]);
  expect(screen.getByText(/players keep their points/)).toBeTruthy();
  expect(screen.getAllByRole("row")[1].textContent).toBe("1Alice3");
});
it("hides the patched section before any release", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ players: [], releases: [] })));
  render(<BoardPage />);
  await screen.findByText(/No confirmed slips/);
  expect(screen.queryByText("Patched tricks")).toBeNull();
});
