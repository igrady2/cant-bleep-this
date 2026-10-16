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
