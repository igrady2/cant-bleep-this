import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";

const { requireAdmin, getMessagesDatabase, loadSuccessMetrics } = vi.hoisted(() => ({
  requireAdmin: vi.fn(), getMessagesDatabase: vi.fn(), loadSuccessMetrics: vi.fn(),
}));
vi.mock("@/lib/admin/access", () => ({ requireAdmin }));
vi.mock("@/lib/messages/db", () => ({ getMessagesDatabase }));
vi.mock("@/lib/admin/metrics", async (original) => ({ ...await original<object>(), loadSuccessMetrics }));
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
const request = (query = "") => new Request(`https://example.test/api/admin/metrics${query}`);

it.each([401, 403])("returns %i before database access or validation", async (status) => {
  requireAdmin.mockResolvedValue(Response.json({ error: "denied" }, { status }));
  expect((await GET(request("?days=bad"))).status).toBe(status);
  expect(getMessagesDatabase).not.toHaveBeenCalled();
  expect(loadSuccessMetrics).not.toHaveBeenCalled();
});
it.each([["", 28], ["?days=7", 7]])("loads the report with the parsed window %s", async (query, days) => {
  requireAdmin.mockResolvedValue(null);
  getMessagesDatabase.mockReturnValue({});
  loadSuccessMetrics.mockResolvedValue({ generatedAt: 123 });
  vi.stubEnv("JEV_COST_PER_CHECK_USD", "0.001");
  const response = await GET(request(query));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ metrics: { generatedAt: 123 } });
  expect(loadSuccessMetrics).toHaveBeenCalledWith({}, { days, costPerCheckUsd: 0.001, costRateSource: "env" });
});
it.each(["0", "91", "1.5", "bad"])("rejects invalid days %s before DB access", async (days) => {
  requireAdmin.mockResolvedValue(null);
  const response = await GET(request(`?days=${days}`));
  expect(response.status).toBe(400);
  expect(await response.json()).toHaveProperty("error");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(getMessagesDatabase).not.toHaveBeenCalled();
});
it.each(["missing", "query", "binding"])("hides %s database failures", async (failure) => {
  requireAdmin.mockResolvedValue(null);
  getMessagesDatabase.mockImplementation(() => {
    if (failure === "binding") throw new Error("private details");
    return failure === "missing" ? null : {};
  });
  loadSuccessMetrics.mockRejectedValue(new Error("private details"));
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: "Metrics are unavailable. Please try again." });
});
