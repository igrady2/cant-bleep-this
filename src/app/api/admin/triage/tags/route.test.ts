import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";

const { requireAdmin, getMessagesDatabase, setTriageTags } = vi.hoisted(() => ({
  requireAdmin: vi.fn(), getMessagesDatabase: vi.fn(), setTriageTags: vi.fn(),
}));
vi.mock("@/lib/admin/access", () => ({ requireAdmin }));
vi.mock("@/lib/messages/db", () => ({ getMessagesDatabase }));
vi.mock("@/lib/admin/triage", () => ({ setTriageTags }));
afterEach(() => vi.resetAllMocks());

function request(body: unknown, headers: Record<string, string> = { "Content-Type": "application/json" }) {
  return new Request("https://example.test/api/admin/triage/tags", {
    method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

it.each([401, 403])("returns the Access guard's %i before reading the body", async (status) => {
  requireAdmin.mockResolvedValue(Response.json({ error: "denied" }, { status }));
  expect((await POST(request({ testCaseId: "s1", tags: ["spelling"] }))).status).toBe(status);
  expect(setTriageTags).not.toHaveBeenCalled();
});

it("saves tags for the maintainer", async () => {
  requireAdmin.mockResolvedValue(null);
  getMessagesDatabase.mockReturnValue({});
  setTriageTags.mockResolvedValue({ ok: true, tags: ["spelling", "context"] });
  const response = await POST(request({ testCaseId: "s1", tags: ["context", "spelling"] }, {
    "Content-Type": "application/json", Origin: "https://example.test",
  }));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ testCaseId: "s1", tags: ["spelling", "context"] });
  expect(setTriageTags).toHaveBeenCalledWith({}, "s1", ["context", "spelling"]);
});

it("refuses cross-origin and non-JSON requests", async () => {
  requireAdmin.mockResolvedValue(null);
  getMessagesDatabase.mockReturnValue({});
  expect((await POST(request({ testCaseId: "s1", tags: [] }, { "Content-Type": "application/json", Origin: "https://evil.test" }))).status).toBe(403);
  expect((await POST(request("testCaseId=s1", { "Content-Type": "application/x-www-form-urlencoded" }))).status).toBe(415);
  expect((await POST(request("{not json"))).status).toBe(400);
  expect((await POST(request("null"))).status).toBe(400);
  expect(setTriageTags).not.toHaveBeenCalled();
});

it("passes through validation errors and hides database failures", async () => {
  requireAdmin.mockResolvedValue(null);
  getMessagesDatabase.mockReturnValue({});
  setTriageTags.mockResolvedValueOnce({ ok: false, status: 404, error: "No slip or false positive has that id." });
  expect((await POST(request({ testCaseId: "x", tags: [] }))).status).toBe(404);
  setTriageTags.mockRejectedValueOnce(new Error("private database details"));
  const failed = await POST(request({ testCaseId: "x", tags: [] }));
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain("private database details");
});
