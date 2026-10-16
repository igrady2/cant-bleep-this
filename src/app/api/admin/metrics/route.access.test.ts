import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";
const { getMessagesDatabase } = vi.hoisted(() => ({ getMessagesDatabase: vi.fn() }));
vi.mock("@/lib/messages/db", () => ({ getMessagesDatabase }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

it.each([[false, 403], [true, 401]])("fails closed with Access configured: %s", async (configured, status) => {
  vi.stubEnv("CF_ACCESS_TEAM_DOMAIN", configured ? "team.cloudflareaccess.com" : "");
  vi.stubEnv("CF_ACCESS_AUD", configured ? "aud" : "");
  expect((await GET(new Request("https://example.test/api/admin/metrics"))).status).toBe(status);
  expect(getMessagesDatabase).not.toHaveBeenCalled();
});
it("rejects a forged unsigned token before touching D1", async () => {
  vi.stubEnv("CF_ACCESS_TEAM_DOMAIN", "team.cloudflareaccess.com");
  vi.stubEnv("CF_ACCESS_AUD", "aud");
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, "");
  const forged = `${encode({ alg: "none" })}.${encode({ aud: "aud", iss: "https://team.cloudflareaccess.com", exp: 9999999999 })}.`;
  const response = await GET(new Request("https://example.test/api/admin/metrics", { headers: { "Cf-Access-Jwt-Assertion": forged } }));
  expect(response.status).toBe(403);
  expect(getMessagesDatabase).not.toHaveBeenCalled();
});
