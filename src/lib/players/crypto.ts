import "server-only";

const TOKEN_BYTE_LENGTH = 32;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return bytesToHex(new Uint8Array(digest));
}

/** 32-byte device token as a 64-character hex recovery code. */
export function generatePlayerToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function hashPlayerToken(token: string): Promise<string> {
  return sha256Hex(token.trim());
}

export async function hashIpForClaimCap(ip: string, salt: string): Promise<string> {
  return sha256Hex(`${salt}:${ip}`);
}

export function utcClaimDay(unixSeconds = Math.floor(Date.now() / 1000)): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}
