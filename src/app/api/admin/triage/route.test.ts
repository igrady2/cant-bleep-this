import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";

const { requireAdmin, getMessagesDatabase, loadTriage } = vi.hoisted(() => ({
  requireAdmin: vi.fn(), getMessagesDatabase: vi.fn(), loadTriage: vi.fn(),
}));
vi.mock("@/lib/admin/access", () => ({ requireAdmin }));
vi.mock("@/lib/messages/db", () => ({ getMessagesDatabase }));
vi.mock("@/lib/admin/triage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/triage")>()), loadTriage,
}));
afterEach(() => vi.resetAllMocks());

const request = (query = "") => new Request(`https://example.test/api/admin/triage${query}`);

it.each([401, 403])("returns the Access guard's %i before touching the database", async (status) => {
  requireAdmin.mockResolvedValue(Response.json({ error: "denied" }, { status }));
  const response = await GET(request());
  expect(response.status).toBe(status);
  expect(getMessagesDatabase).not.toHaveBeenCalled();
  expect(loadTriage).not.toHaveBeenCalled();
});

it.each([["", "slip"], ["?kind=slip", "slip"], ["?kind=false_positive", "false_positive"]])(
  "loads %j as %s without caching", async (query, kind) => {
    requireAdmin.mockResolvedValue(null);
    getMessagesDatabase.mockReturnValue({});
    loadTriage.mockResolvedValue({ kind, counts: { slip: 0, false_positive: 0 }, groups: [] });
    const response = await GET(request(query));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(loadTriage).toHaveBeenCalledWith({}, kind);
    expect((await response.json()).kind).toBe(kind);
  },
);

it("rejects an unknown kind", async () => {
  requireAdmin.mockResolvedValue(null);
  expect((await GET(request("?kind=clean"))).status).toBe(400);
});

it.each([false, true])("hides database failures (binding missing: %s)", async (missing) => {
  requireAdmin.mockResolvedValue(null);
  getMessagesDatabase.mockReturnValue(missing ? null : {});
  loadTriage.mockRejectedValue(new Error("private database details"));
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private database details");
});
