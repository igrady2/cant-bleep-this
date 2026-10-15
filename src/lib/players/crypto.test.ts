import { describe, expect, it } from "vitest";

import { generatePlayerToken, hashIpForClaimCap, hashPlayerToken, sha256Hex } from "./crypto";

describe("player crypto", () => {
  it("generates a 64-character hex token from 32 bytes", () => {
    const token = generatePlayerToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(generatePlayerToken()).not.toBe(token);
  });

  it("hashes tokens and salted IPs deterministically", async () => {
    expect(await hashPlayerToken("abc")).toBe(await sha256Hex("abc"));
    expect(await hashIpForClaimCap("203.0.113.1", "salt")).toBe(
      await sha256Hex("salt:203.0.113.1"),
    );
  });
});
