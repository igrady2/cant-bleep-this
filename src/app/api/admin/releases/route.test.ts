import { afterEach, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const { requireAdmin, getMessagesDatabase, loadReleases, recordFilterRelease } = vi.hoisted(() => ({
  requireAdmin: vi.fn(), getMessagesDatabase: vi.fn(), loadReleases: vi.fn(), recordFilterRelease: vi.fn(),
}));
vi.mock("@/lib/admin/access", () => ({ requireAdmin }));
vi.mock("@/lib/messages/db", () => ({ getMessagesDatabase }));
vi.mock("@/lib/filter-release/releases", () => ({ loadReleases, recordFilterRelease }));
afterEach(() => vi.resetAllMocks());

const URL_ = "https://example.test/api/admin/releases";
const post = (body: string, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request(URL_, { method: "POST", body, headers });

it.each([401, 403])("returns the Access guard's %i before touching the database", async (status) => {
  requireAdmin.mockResolvedValue(Response.json({ error: "denied" }, { status }));
  expect((await GET(new Request(URL_))).status).toBe(status);
  expect((await POST(post("{}"))).status).toBe(status);
  expect(getMessagesDatabase).not.toHaveBeenCalled();
  expect(recordFilterRelease).not.toHaveBeenCalled();
});

it("lists releases without caching", async () => {
  requireAdmin.mockResolvedValue(null);
  getMessagesDatabase.mockReturnValue({});
  loadReleases.mockResolvedValue([{ version: "v2" }]);
  const response = await GET(new Request(URL_));
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ releases: [{ version: "v2" }] });
});

it("records the uploaded report", async () => {
  requireAdmin.mockResolvedValue(null);
  getMessagesDatabase.mockReturnValue({});
  recordFilterRelease.mockResolvedValue({ ok: true, release: { version: "v2" } });
  const response = await POST(post(JSON.stringify({ reportVersion: 1 })));
  expect(response.status).toBe(201);
  expect(recordFilterRelease).toHaveBeenCalledWith({}, { reportVersion: 1 });
  expect(await response.json()).toEqual({ release: { version: "v2" } });
});

it("passes through validation failures", async () => {
  requireAdmin.mockResolvedValue(null);
  getMessagesDatabase.mockReturnValue({});
  recordFilterRelease.mockResolvedValue({ ok: false, status: 409, error: "Filter version v2 is already released." });
  const response = await POST(post("{}"));
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "Filter version v2 is already released." });
});

it("rejects cross-origin, non-JSON and malformed bodies", async () => {
  requireAdmin.mockResolvedValue(null);
  expect((await POST(post("{}", { "content-type": "application/json", origin: "https://evil.test" }))).status).toBe(403);
  expect((await POST(post("{}", { "content-type": "text/plain" }))).status).toBe(415);
  expect((await POST(post("{"))).status).toBe(400);
  expect(recordFilterRelease).not.toHaveBeenCalled();
});

it.each([false, true])("hides database failures (binding missing: %s)", async (missing) => {
  requireAdmin.mockResolvedValue(null);
  getMessagesDatabase.mockReturnValue(missing ? null : {});
  loadReleases.mockRejectedValue(new Error("private database details"));
  recordFilterRelease.mockRejectedValue(new Error("private database details"));
  for (const response of [await GET(new Request(URL_)), await POST(post("{}"))]) {
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database details");
  }
});
