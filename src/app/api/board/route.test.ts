import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
const { getBoardDatabase, loadBoard, loadBoardReleases } = vi.hoisted(() => ({
  getBoardDatabase: vi.fn(), loadBoard: vi.fn(), loadBoardReleases: vi.fn(),
}));
vi.mock("@/lib/board", () => ({ getBoardDatabase, loadBoard, loadBoardReleases }));
beforeEach(() => vi.resetAllMocks());
it.each([{ players: [] }, { players: [{ name: "Player", slips: 3 }] }])("caches successful public boards for five minutes", async ({ players }) => {
  getBoardDatabase.mockReturnValue({}); loadBoard.mockResolvedValue(players); loadBoardReleases.mockResolvedValue([]);
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("public, max-age=300, s-maxage=300");
  const body = await response.json();
  expect(body).toEqual({ players, releases: [] });
  for (const entry of body.players) {
    expect(Object.keys(entry)).toEqual(["name", "slips"]);
  }
});
it.each([false, true])("does not cache unavailable boards (query failure: %s)", async (queryFailure) => {
  getBoardDatabase.mockReturnValue(queryFailure ? {} : null);
  loadBoard.mockRejectedValue(new Error("private database details"));
  loadBoardReleases.mockResolvedValue([]);
  const response = await GET();
  expect(response.status).toBe(503);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.text()).not.toContain("private database details");
});
it("lists released versions with their patched slip counts", async () => {
  const releases = [{ version: "v2", releasedAt: 1_800_000_000, patchedSlips: 4 }];
  getBoardDatabase.mockReturnValue({}); loadBoard.mockResolvedValue([]); loadBoardReleases.mockResolvedValue(releases);
  const body = await (await GET()).json();
  expect(body.releases).toEqual(releases);
});
it("does not cache the board when releases fail to load", async () => {
  getBoardDatabase.mockReturnValue({}); loadBoard.mockResolvedValue([]);
  loadBoardReleases.mockRejectedValue(new Error("private database details"));
  const response = await GET();
  expect(response.status).toBe(503);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
