import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verify: vi.fn(), database: vi.fn(), remove: vi.fn(), ban: vi.fn() }));
vi.mock("@/lib/admin/access", () => ({ verifyAdminHeaders: mocks.verify }));
vi.mock("@/lib/messages/db", () => ({ getMessagesDatabase: mocks.database }));
vi.mock("@/lib/messages/maintainer-removal", () => ({ removeMessageAsMaintainer: mocks.remove }));
vi.mock("@/lib/admin/moderation", () => ({ banPlayerAsMaintainer: mocks.ban, loadModerationMessages: vi.fn() }));
import { POST, GET } from "./route";
function request(body: unknown, origin = "https://game.test") {
  return new Request("https://game.test/api/admin/moderation", { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.verify.mockResolvedValue({ ok: true, email: "maintainer@example.test" });
  mocks.database.mockReturnValue({});
  mocks.ban.mockResolvedValue(true);
});
it.each([401, 403])("denies unauthorized reads and writes (%s)", async (status) => {
  mocks.verify.mockResolvedValue({ ok: false, status });
  expect((await POST(request({ action: "delete_message", targetId: "m" }))).status).toBe(status);
  expect((await GET(new Request("https://game.test/api/admin/moderation"))).status).toBe(status);
  expect(mocks.database).not.toHaveBeenCalled();
});
it("requires an audit identity", async () => {
  mocks.verify.mockResolvedValue({ ok: true, email: null });
  expect((await POST(request({ action: "delete_message", targetId: "m" }))).status).toBe(403);
  expect(mocks.remove).not.toHaveBeenCalled();
});
it.each(["delete_message", "ban_player"])("takes the %s actor only from verified claims", async (action) => {
  const response = await POST(request({ action, targetId: "m", actor: "forged" }));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(action === "delete_message" ? mocks.remove : mocks.ban).toHaveBeenCalledWith({}, "m", "maintainer@example.test");
});
it("rejects cross-origin mutations and invalid actions", async () => {
  expect((await POST(request({ action: "ban_player", targetId: "m" }, "https://elsewhere.test"))).status).toBe(403);
  expect((await POST(request({ action: "unknown", targetId: "m" }))).status).toBe(400);
  expect(mocks.ban).not.toHaveBeenCalled();
});
it("fails closed when storage fails", async () => {
  mocks.remove.mockRejectedValue(new Error("private database detail"));
  const response = await POST(request({ action: "delete_message", targetId: "m" }));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private database detail");
});
