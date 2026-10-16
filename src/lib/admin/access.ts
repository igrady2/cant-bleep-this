/**
 * Cloudflare Access JWT verification for /admin and /api/admin (#23).
 * Access sits in front of these paths, and the Worker verifies the token
 * itself so the routes cannot be reached around Access (for example through
 * a workers.dev hostname). Missing or invalid configuration fails closed.
 *
 * WebCrypto only: no dependency. Kept free of "server-only" so src/proxy.ts can
 * import it; it reads no secrets beyond the two config values.
 */

export const ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion";
export const ACCESS_JWT_COOKIE = "CF_Authorization";

/** Access rotates signing keys; a short cache still picks up a new kid. */
const CERTS_TTL_MS = 10 * 60 * 1000;
/** Tolerated clock skew between Access and the Worker, in seconds. */
const CLOCK_SKEW_SECONDS = 60;

export interface AccessConfig {
  /** Issuer origin, for example https://team.cloudflareaccess.com. */
  issuer: string;
  /** Application audience (AUD) tag. */
  audience: string;
}

export type AccessVerification =
  | { ok: true; email: string | null }
  | { ok: false; status: 401 | 403; reason: AccessFailure };

export type AccessFailure =
  | "not_configured"
  | "missing_token"
  | "malformed"
  | "unsupported_algorithm"
  | "unknown_key"
  | "bad_signature"
  | "wrong_audience"
  | "wrong_issuer"
  | "expired"
  | "not_yet_valid"
  | "certs_unavailable";

export interface VerifyOptions {
  fetch?: typeof fetch;
  /** Unix seconds; defaults to the current time. */
  now?: number;
}

/**
 * Reads CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD. The team domain may be given
 * with or without https://; anything that is not a bare https host is rejected.
 */
export function readAccessConfig(env: Record<string, string | undefined> = process.env): AccessConfig | null {
  const domain = env.CF_ACCESS_TEAM_DOMAIN?.trim();
  const audience = env.CF_ACCESS_AUD?.trim();
  if (!domain || !audience) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(domain) ? domain : `https://${domain}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port
    || url.pathname.replace(/\/+$/, "") !== "" || url.search || url.hash) {
    return null;
  }
  return { issuer: url.origin, audience };
}

/** The Access header wins; the CF_Authorization cookie covers browser requests. */
export function accessTokenFromHeaders(headers: Headers): string | null {
  const header = headers.get(ACCESS_JWT_HEADER)?.trim();
  if (header) return header;
  for (const part of (headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === ACCESS_JWT_COOKIE) {
      const value = part.slice(separator + 1).trim();
      return value || null;
    }
  }
  return null;
}

interface Jwk extends JsonWebKey {
  kid?: string;
}

const certsCache = new Map<string, { keys: Jwk[]; fetchedAt: number }>();

/** Clears cached signing keys (tests). */
export function resetAccessCertsCache(): void {
  certsCache.clear();
}

async function signingKeys(issuer: string, fetcher: typeof fetch, refresh: boolean): Promise<Jwk[]> {
  const cached = certsCache.get(issuer);
  if (cached && !refresh && Date.now() - cached.fetchedAt < CERTS_TTL_MS) return cached.keys;
  const response = await fetcher(`${issuer}/cdn-cgi/access/certs`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Access certs unavailable");
  const body = await response.json() as { keys?: unknown };
  if (!Array.isArray(body.keys)) throw new Error("Access certs malformed");
  const keys = body.keys.filter((key): key is Jwk =>
    !!key && typeof key === "object" && (key as Jwk).kty === "RSA" && typeof (key as Jwk).kid === "string");
  certsCache.set(issuer, { keys, fetchedAt: Date.now() });
  return keys;
}

function base64UrlBytes(segment: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(segment)) throw new Error("Not base64url");
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(segment.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJson(segment: string): Record<string, unknown> {
  const value: unknown = JSON.parse(new TextDecoder().decode(base64UrlBytes(segment)));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Not an object");
  return value as Record<string, unknown>;
}

const fail = (status: 401 | 403, reason: AccessFailure): AccessVerification => ({ ok: false, status, reason });

/**
 * Verifies an Access JWT: RS256 signature against the team's published certs,
 * then aud, iss, exp and nbf. Any doubt is a denial.
 */
export async function verifyAccessJwt(
  token: string | null | undefined,
  config: AccessConfig | null,
  options: VerifyOptions = {},
): Promise<AccessVerification> {
  if (!config) return fail(403, "not_configured");
  if (!token) return fail(401, "missing_token");

  const parts = token.split(".");
  if (parts.length !== 3) return fail(403, "malformed");
  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  let signature: Uint8Array<ArrayBuffer>;
  try {
    header = decodeJson(parts[0]);
    claims = decodeJson(parts[1]);
    signature = base64UrlBytes(parts[2]);
  } catch {
    return fail(403, "malformed");
  }
  if (header.alg !== "RS256") return fail(403, "unsupported_algorithm");
  if (typeof header.kid !== "string" || !header.kid) return fail(403, "unknown_key");

  const fetcher = options.fetch ?? fetch;
  let jwk: Jwk | undefined;
  try {
    jwk = (await signingKeys(config.issuer, fetcher, false)).find((key) => key.kid === header.kid);
    // A kid we have not seen may be a fresh rotation.
    if (!jwk) jwk = (await signingKeys(config.issuer, fetcher, true)).find((key) => key.kid === header.kid);
  } catch {
    return fail(403, "certs_unavailable");
  }
  if (!jwk) return fail(403, "unknown_key");

  let valid = false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      signature,
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {
    valid = false;
  }
  if (!valid) return fail(403, "bad_signature");

  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.some((aud) => aud === config.audience)) return fail(403, "wrong_audience");
  if (claims.iss !== config.issuer) return fail(403, "wrong_issuer");

  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SECONDS <= now) return fail(403, "expired");
  if (claims.nbf !== undefined && (typeof claims.nbf !== "number" || claims.nbf - CLOCK_SKEW_SECONDS > now)) {
    return fail(403, "not_yet_valid");
  }

  return { ok: true, email: typeof claims.email === "string" ? claims.email : null };
}

/** Verifies the request's Access token against the Worker's configuration. */
export async function verifyAdminHeaders(headers: Headers, options: VerifyOptions = {}): Promise<AccessVerification> {
  return verifyAccessJwt(accessTokenFromHeaders(headers), readAccessConfig(), options);
}

/**
 * Route-handler guard: null when the caller is the Access-verified maintainer,
 * otherwise a 401/403 response that reveals nothing about why.
 */
export async function requireAdmin(request: Request, options: VerifyOptions = {}): Promise<Response | null> {
  const result = await verifyAdminHeaders(request.headers, options);
  if (result.ok) return null;
  return Response.json(
    { error: result.status === 401 ? "Sign in through Cloudflare Access." : "Admin access denied." },
    { status: result.status, headers: { "Cache-Control": "no-store" } },
  );
}
