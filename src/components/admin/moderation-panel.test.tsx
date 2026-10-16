import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModerationPanel } from "./moderation-panel";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it.each(["Delete message", "Ban username"])("submits %s and updates the controls", async (label) => {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => Response.json(init?.method === "POST" ? { ok: true } : {
    messages: [{ id: "m", playerId: "p", name: "alice", text: "synthetic", bannedAt: null }],
  }));
  vi.stubGlobal("fetch", fetchMock);
  render(<ModerationPanel />);
  await userEvent.click(await screen.findByRole("button", { name: label }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  const body = JSON.parse(fetchMock.mock.calls[1][1]!.body as string);
  expect(body).toEqual(label === "Delete message" ? { action: "delete_message", targetId: "m" } : { action: "ban_player", targetId: "p" });
  if (label === "Delete message") await waitFor(() => expect(screen.queryByText(/synthetic/)).toBeNull());
  else expect((await screen.findByRole("button", { name: "Banned" }) as HTMLButtonElement).disabled).toBe(true);
});
it("keeps the message visible and reports a failed mutation", async () => {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST"
    ? Response.json({ error: "unavailable" }, { status: 503 })
    : Response.json({ messages: [{ id: "m", playerId: "p", name: "alice", text: "synthetic", bannedAt: null }] })));
  render(<ModerationPanel />);
  await userEvent.click(await screen.findByRole("button", { name: "Delete message" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Could not save");
  expect(screen.getByText(/synthetic/)).toBeTruthy();
});
