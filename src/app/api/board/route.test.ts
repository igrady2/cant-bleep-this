import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
const { getBoardDatabase, loadBoard } = vi.hoisted(() => ({ getBoardDatabase: vi.fn(), loadBoard: vi.fn() }));
vi.mock("@/lib/board", () => ({ getBoardDatabase, loadBoard }));
beforeEach(() => vi.resetAllMocks());
it.each([{ players: [] }, { players: [{ playerId: "p", name: "Player", slips: 3 }] }])("caches successful public boards for five minutes", async ({ players }) => {
  getBoardDatabase.mockReturnValue({}); loadBoard.mockResolvedValue(players);
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("public, max-age=300, s-maxage=300");
  expect(await response.json()).toEqual({ players });
});
it.each([false, true])("does not cache unavailable boards (query failure: %s)", async (queryFailure) => {
  getBoardDatabase.mockReturnValue(queryFailure ? {} : null);
  loadBoard.mockRejectedValue(new Error("private database details"));
  const response = await GET();
  expect(response.status).toBe(503);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.text()).not.toContain("private database details");
});
