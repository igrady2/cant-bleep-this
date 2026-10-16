import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";
import { POST } from "./tags/route";

const { getMessagesDatabase } = vi.hoisted(() => ({ getMessagesDatabase: vi.fn() }));
vi.mock("@/lib/messages/db", () => ({ getMessagesDatabase }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

// The real Access guard, unmocked: the routes must fail closed on their own.
it.each([
  ["no Access config", {}, 403],
  ["config but no token", { CF_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com", CF_ACCESS_AUD: "aud" }, 401],
])("denies admin routes with %s", async (_label, vars: Record<string, string>, status) => {
  vi.stubEnv("CF_ACCESS_TEAM_DOMAIN", vars.CF_ACCESS_TEAM_DOMAIN ?? "");
  vi.stubEnv("CF_ACCESS_AUD", vars.CF_ACCESS_AUD ?? "");
  getMessagesDatabase.mockReturnValue({});
  const read = await GET(new Request("https://example.test/api/admin/triage?kind=false_positive"));
  const write = await POST(new Request("https://example.test/api/admin/triage/tags", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ testCaseId: "s1", tags: [] }),
  }));
  expect([read.status, write.status]).toEqual([status, status]);
  expect(getMessagesDatabase).not.toHaveBeenCalled();
});

it("rejects a forged unsigned token even with config present", async () => {
  vi.stubEnv("CF_ACCESS_TEAM_DOMAIN", "team.cloudflareaccess.com");
  vi.stubEnv("CF_ACCESS_AUD", "aud");
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, "");
  const forged = `${encode({ alg: "none" })}.${encode({ aud: "aud", iss: "https://team.cloudflareaccess.com", exp: 9_999_999_999 })}.`;
  const response = await GET(new Request("https://example.test/api/admin/triage", { headers: { "Cf-Access-Jwt-Assertion": forged } }));
  expect(response.status).toBe(403);
  expect(getMessagesDatabase).not.toHaveBeenCalled();
});
