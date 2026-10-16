import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  accessTokenFromHeaders,
  readAccessConfig,
  requireAdmin,
  resetAccessCertsCache,
  verifyAccessJwt,
  type AccessConfig,
} from "./access";

const ISSUER = "https://team.cloudflareaccess.com";
const AUD = "synthetic-aud-tag";
const config: AccessConfig = { issuer: ISSUER, audience: AUD };
const NOW = 1_800_000_000;

let signingKey: CryptoKeyPair;
let otherKey: CryptoKeyPair;
let publicJwk: JsonWebKey;

const algorithm = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };

beforeAll(async () => {
  signingKey = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"]) as CryptoKeyPair;
  otherKey = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"]) as CryptoKeyPair;
  publicJwk = await crypto.subtle.exportKey("jwk", signingKey.publicKey) as JsonWebKey;
});

function base64Url(bytes: Uint8Array | string): string {
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(
  claims: Record<string, unknown>,
  { key = signingKey.privateKey, header = { alg: "RS256", kid: "kid-1", typ: "JWT" } }: { key?: CryptoKey; header?: Record<string, unknown> } = {},
): Promise<string> {
  const input = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input));
  return `${input}.${base64Url(new Uint8Array(signature))}`;
}

const goodClaims = () => ({ aud: [AUD], iss: ISSUER, email: "maintainer@example.test", iat: NOW - 10, nbf: NOW - 10, exp: NOW + 3600 });

let certsFetch: ReturnType<typeof vi.fn>;
beforeEach(() => {
  resetAccessCertsCache();
  certsFetch = vi.fn(async () => Response.json({ keys: [{ ...publicJwk, kid: "kid-1", alg: "RS256", use: "sig" }] }));
});
afterEach(() => vi.unstubAllEnvs());

const verify = (token: string | null, cfg: AccessConfig | null = config) =>
  verifyAccessJwt(token, cfg, { fetch: certsFetch as unknown as typeof fetch, now: NOW });

describe("verifyAccessJwt", () => {
  it("accepts a valid token signed by the team's certs", async () => {
    expect(await verify(await sign(goodClaims()))).toEqual({ ok: true, email: "maintainer@example.test" });
    expect(certsFetch).toHaveBeenCalledWith(`${ISSUER}/cdn-cgi/access/certs`, expect.anything());
  });

  it("accepts a single-string aud", async () => {
    expect((await verify(await sign({ ...goodClaims(), aud: AUD }))).ok).toBe(true);
  });

  it("rejects the wrong audience", async () => {
    expect(await verify(await sign({ ...goodClaims(), aud: ["another-app"] })))
      .toEqual({ ok: false, status: 403, reason: "wrong_audience" });
  });

  it("rejects the wrong issuer", async () => {
    expect(await verify(await sign({ ...goodClaims(), iss: "https://evil.cloudflareaccess.com" })))
      .toEqual({ ok: false, status: 403, reason: "wrong_issuer" });
  });

  it("rejects expired tokens and tokens without exp", async () => {
    expect(await verify(await sign({ ...goodClaims(), exp: NOW - 120 })))
      .toEqual({ ok: false, status: 403, reason: "expired" });
    const { exp: _exp, ...noExp } = goodClaims();
    void _exp;
    expect((await verify(await sign(noExp))).ok).toBe(false);
  });

  it("rejects tokens that are not valid yet", async () => {
    expect(await verify(await sign({ ...goodClaims(), nbf: NOW + 600 })))
      .toEqual({ ok: false, status: 403, reason: "not_yet_valid" });
  });

  it("rejects a bad signature", async () => {
    expect(await verify(await sign(goodClaims(), { key: otherKey.privateKey })))
      .toEqual({ ok: false, status: 403, reason: "bad_signature" });
  });

  it("rejects a tampered payload", async () => {
    const [header, , signature] = (await sign(goodClaims())).split(".");
    const forged = `${header}.${base64Url(JSON.stringify({ ...goodClaims(), email: "attacker@example.test" }))}.${signature}`;
    expect(await verify(forged)).toEqual({ ok: false, status: 403, reason: "bad_signature" });
  });

  it("rejects alg none and HS256", async () => {
    const claims = base64Url(JSON.stringify(goodClaims()));
    expect(await verify(`${base64Url(JSON.stringify({ alg: "none", kid: "kid-1" }))}.${claims}.`))
      .toEqual({ ok: false, status: 403, reason: "unsupported_algorithm" });
    expect(await verify(`${base64Url(JSON.stringify({ alg: "HS256", kid: "kid-1" }))}.${claims}.AAAA`))
      .toEqual({ ok: false, status: 403, reason: "unsupported_algorithm" });
  });

  it("rejects an unknown kid after one refresh", async () => {
    expect(await verify(await sign(goodClaims(), { header: { alg: "RS256", kid: "kid-unknown" } })))
      .toEqual({ ok: false, status: 403, reason: "unknown_key" });
    expect(certsFetch).toHaveBeenCalledTimes(2);
  });

  it("picks up a rotated key on an unknown kid", async () => {
    expect((await verify(await sign(goodClaims()))).ok).toBe(true);
    const rotated = await crypto.subtle.exportKey("jwk", otherKey.publicKey) as JsonWebKey;
    certsFetch.mockImplementation(async () => Response.json({ keys: [{ ...rotated, kid: "kid-2" }] }));
    const token = await sign(goodClaims(), { key: otherKey.privateKey, header: { alg: "RS256", kid: "kid-2" } });
    expect((await verify(token)).ok).toBe(true);
  });

  it("fails closed when certs cannot be fetched", async () => {
    certsFetch.mockImplementation(async () => new Response("down", { status: 500 }));
    expect(await verify(await sign(goodClaims())))
      .toEqual({ ok: false, status: 403, reason: "certs_unavailable" });
  });

  it("rejects malformed tokens", async () => {
    for (const token of ["abc", "a.b", "a.b.c.d", "!!.!!.!!", `${base64Url("[]")}.${base64Url("{}")}.x`]) {
      expect(await verify(token)).toMatchObject({ ok: false, status: 403 });
    }
  });

  it("fails closed without configuration, even for a valid token", async () => {
    expect(await verify(await sign(goodClaims()), null))
      .toEqual({ ok: false, status: 403, reason: "not_configured" });
    expect(certsFetch).not.toHaveBeenCalled();
  });

  it("returns 401 without a token", async () => {
    expect(await verify(null)).toEqual({ ok: false, status: 401, reason: "missing_token" });
  });
});

describe("readAccessConfig", () => {
  it("normalizes the team domain to an https origin", () => {
    expect(readAccessConfig({ CF_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com", CF_ACCESS_AUD: AUD })).toEqual(config);
    expect(readAccessConfig({ CF_ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com/", CF_ACCESS_AUD: ` ${AUD} ` })).toEqual(config);
  });

  it("is null when either value is missing or the domain is not a bare https host", () => {
    expect(readAccessConfig({})).toBeNull();
    expect(readAccessConfig({ CF_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com" })).toBeNull();
    expect(readAccessConfig({ CF_ACCESS_AUD: AUD })).toBeNull();
    expect(readAccessConfig({ CF_ACCESS_TEAM_DOMAIN: " ", CF_ACCESS_AUD: AUD })).toBeNull();
    for (const domain of ["http://team.cloudflareaccess.com", "https://team.cloudflareaccess.com/path", "https://user@team.cloudflareaccess.com", "https://team.cloudflareaccess.com:8443"]) {
      expect(readAccessConfig({ CF_ACCESS_TEAM_DOMAIN: domain, CF_ACCESS_AUD: AUD })).toBeNull();
    }
  });
});

describe("accessTokenFromHeaders", () => {
  it("prefers the Access header and falls back to the CF_Authorization cookie", () => {
    expect(accessTokenFromHeaders(new Headers({ "Cf-Access-Jwt-Assertion": "header.jwt.x", cookie: "CF_Authorization=cookie.jwt.x" }))).toBe("header.jwt.x");
    expect(accessTokenFromHeaders(new Headers({ cookie: "theme=dark; CF_Authorization=cookie.jwt.x; other=1" }))).toBe("cookie.jwt.x");
    expect(accessTokenFromHeaders(new Headers({ cookie: "XCF_Authorization=nope" }))).toBeNull();
    expect(accessTokenFromHeaders(new Headers())).toBeNull();
  });
});

describe("requireAdmin", () => {
  const request = (headers: HeadersInit = {}) => new Request("https://example.test/api/admin/triage", { headers });

  it("denies everything when the Worker has no Access config", async () => {
    vi.stubEnv("CF_ACCESS_TEAM_DOMAIN", "");
    vi.stubEnv("CF_ACCESS_AUD", "");
    const response = await requireAdmin(request({ "Cf-Access-Jwt-Assertion": await sign(goodClaims()) }), { fetch: certsFetch as unknown as typeof fetch, now: NOW });
    expect(response?.status).toBe(403);
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 401 without a token, 403 with a bad one, and null for the maintainer", async () => {
    vi.stubEnv("CF_ACCESS_TEAM_DOMAIN", "team.cloudflareaccess.com");
    vi.stubEnv("CF_ACCESS_AUD", AUD);
    const options = { fetch: certsFetch as unknown as typeof fetch, now: NOW };
    expect((await requireAdmin(request(), options))?.status).toBe(401);
    const wrongAud = await sign({ ...goodClaims(), aud: ["other"] });
    const denied = await requireAdmin(request({ cookie: `CF_Authorization=${wrongAud}` }), options);
    expect(denied?.status).toBe(403);
    expect(await denied?.text()).not.toContain("wrong_audience");
    expect(await requireAdmin(request({ cookie: `CF_Authorization=${await sign(goodClaims())}` }), options)).toBeNull();
  });
});
