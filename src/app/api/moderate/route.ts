import { moderate } from "@/lib/moderation";
import { TypeSafeError } from "@/lib/moderation/typesafe";
import { isRateLimited } from "@/lib/rate-limit";

const MAX_LENGTH = 1000;

export async function POST(request: Request) {
  if (await isRateLimited(request)) {
    return Response.json(
      { error: "You're sending messages too quickly. Wait a minute and try again." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const { message } = (payload ?? {}) as { message?: unknown };
  const text = typeof message === "string" ? message.trim() : "";
  if (!text) {
    return Response.json({ error: "Message can't be empty." }, { status: 400 });
  }
  if (text.length > MAX_LENGTH) {
    return Response.json(
      { error: `Messages can be up to ${MAX_LENGTH} characters.` },
      { status: 400 },
    );
  }

  try {
    return Response.json(await moderate(text));
  } catch (err) {
    console.error("[moderate]", err);
    const status = err instanceof TypeSafeError && err.status === 401 ? 502 : 503;
    return Response.json(
      {
        error:
          err instanceof TypeSafeError && err.status === 401
            ? "The moderation service rejected our API key. Check TYPESAFE_API_KEY."
            : "The moderation service is unavailable right now, so your message wasn't posted. Please try again.",
      },
      { status },
    );
  }
}
