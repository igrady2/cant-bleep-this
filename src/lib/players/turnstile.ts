import "server-only";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileVerifyResult =
  | { ok: true }
  | { ok: false; error: string };

export async function verifyTurnstileToken(
  token: string,
  secretKey: string,
  remoteIp: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<TurnstileVerifyResult> {
  const trimmed = token.trim();
  if (!trimmed) {
    return { ok: false, error: "Complete the verification check and try again." };
  }

  const body = new URLSearchParams({
    secret: secretKey,
    response: trimmed,
  });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) {
      console.error("[turnstile]", "siteverify HTTP", response.status);
      return { ok: false, error: "Verification failed. Please try again." };
    }
    const payload = (await response.json()) as { success?: boolean };
    if (!payload.success) {
      return { ok: false, error: "Verification failed. Please try again." };
    }
    return { ok: true };
  } catch (err) {
    console.error("[turnstile]", err);
    return { ok: false, error: "Verification failed. Please try again." };
  }
}
