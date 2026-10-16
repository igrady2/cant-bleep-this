import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
const { getBoardDatabase, loadBoard } = vi.hoisted(() => ({ getBoardDatabase: vi.fn(), loadBoard: vi.fn() }));
vi.mock("@/lib/board", () => ({ getBoardDatabase, loadBoard }));
beforeEach(() => vi.resetAllMocks());
it.each([{ players: [] }, { players: [{ name: "Player", slips: 3 }] }])("caches successful public boards for five minutes", async ({ players }) => {
  getBoardDatabase.mockReturnValue({}); loadBoard.mockResolvedValue(players);
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("public, max-age=300, s-maxage=300");
  const body = await response.json();
  expect(body).toEqual({ players });
  for (const entry of body.players) {
    expect(Object.keys(entry)).toEqual(["name", "slips"]);
  }
});
it.each([false, true])("does not cache unavailable boards (query failure: %s)", async (queryFailure) => {
  getBoardDatabase.mockReturnValue(queryFailure ? {} : null);
  loadBoard.mockRejectedValue(new Error("private database details"));
  const response = await GET();
  expect(response.status).toBe(503);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.text()).not.toContain("private database details");
});
