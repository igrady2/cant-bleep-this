import { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";
import { config, proxy } from "./proxy";

afterEach(() => vi.unstubAllEnvs());

it("covers the admin page and admin API paths", () => {
  expect(config.matcher).toEqual(["/admin", "/admin/:path*", "/api/admin/:path*"]);
});

it("fails closed for the admin page and API without Access config", async () => {
  vi.stubEnv("CF_ACCESS_TEAM_DOMAIN", "");
  vi.stubEnv("CF_ACCESS_AUD", "");
  const page = await proxy(new NextRequest("https://example.test/admin"));
  expect(page.status).toBe(403);
  expect(page.headers.get("Cache-Control")).toBe("no-store");
  const api = await proxy(new NextRequest("https://example.test/api/admin/triage"));
  expect(api.status).toBe(403);
  expect(await api.json()).toEqual({ error: "Admin access denied." });
});

it("returns 401 when configured but no token is sent", async () => {
  vi.stubEnv("CF_ACCESS_TEAM_DOMAIN", "team.cloudflareaccess.com");
  vi.stubEnv("CF_ACCESS_AUD", "aud");
  expect((await proxy(new NextRequest("https://example.test/admin"))).status).toBe(401);
});
