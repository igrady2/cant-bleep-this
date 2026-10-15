import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import BoardPage from "./page";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("shows loading before the board arrives", () => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  render(<BoardPage />);
  expect(screen.getByRole("status").textContent).toContain("Loading");
});
it("shows names and unweighted counts in API order", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ players: [
    { playerId: "b", name: "Bob", slips: 12 }, { playerId: "a", name: "Alice", slips: 2 },
  ] })));
  render(<BoardPage />);
  await screen.findByRole("table");
  const rows = screen.getAllByRole("row");
  expect(rows[1].textContent).toBe("1Bob12");
  expect(rows[2].textContent).toBe("2Alice2");
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
