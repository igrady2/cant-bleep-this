# school-chat-filter: moderated class forum

A generic content filter for school chat, shown as a small chat interface. Users type into the chat box and press **Enter** to send. Before a message is added to the chat log, the server sends it to **Jev**, the flagship System One model from [TypeSafe AI](https://docs.typesafe.ai). Jev decides whether the message would be inappropriate for a student or teacher to post in an online school forum. Allowed messages are posted. Blocked messages are not posted; instead the author sees which categories were flagged and why.

Stack: Next.js 16 (App Router), TypeScript, Tailwind CSS v4, and shadcn/ui. Fonts: Familjen Grotesk (headings) and Arimo (body).

## Run it locally

```bash
npm install
cp .env.example .env.local   # optional: add your TypeSafe key
npm run dev                  # http://localhost:4317
```

### Moderation provider

| Env var | Purpose |
| --- | --- |
| `TYPESAFE_API_KEY` | TypeSafe API key ([docs](https://docs.typesafe.ai/api)). When set, every message is scored by Jev. |
| `TYPESAFE_MODEL` | Optional. Defaults to `jev-latest`. |
| `MODERATION_THRESHOLD` | Optional. Probability at which a category blocks a message. Defaults to `0.5`. |
| `MODERATION_PROVIDER` | Optional. Set to `mock` to force the local mock even when a key is set. |

**Without `TYPESAFE_API_KEY`, the app uses a local keyword mock** (`src/lib/moderation/mock.ts`) so the demo still works offline. A "Demo" badge above the chat box shows while the mock is active. The mock is only a stand-in and is not real moderation.

## How moderation works

`POST /api/moderate` with `{ message }` sends a single request to `https://api.typesafe.ai/v1/systemone`. The request includes:

- **state**: the forum context (a K–12 class forum for students and teachers) and the message. Students and teachers are held to the same standard, so the author's role is not sent.
- **questions**: one [Noul](https://docs.typesafe.ai/primitives/noul) (yes/no probability) question per category. Each category is a separate question because several can apply to the same message. The questions run in parallel within that one request.

The rule is applied in code: if any category reaches the threshold, the message is blocked. The response returns every category's probability, so you can tune the threshold without changing the questions. If the moderation service fails, the message is not posted, and the UI shows an error with a Retry button.

### Categories (`src/lib/moderation/categories.ts`)

1. Bullying or harassment
2. Hate speech
3. Sexual content
4. Violence or threats
5. Self-harm (the explanation points the author to a trusted adult and to the 988 crisis line)
6. Profanity
7. Personal information (phone numbers, addresses, logins, social handles)
8. Academic dishonesty
9. Spam
10. Terms of Use violation, based on a standard K–12 platform Acceptable Use policy. This covers unlawful activity, defamation, impersonation, unauthorized access, harvesting other users' information, and commercial use without permission.

## Deploy to Cloudflare Workers

The app runs on Cloudflare Workers through the [OpenNext Cloudflare adapter](https://opennext.js.org/cloudflare). Configuration is in `wrangler.jsonc` and `open-next.config.ts`.

```bash
npx wrangler login
npx wrangler secret put TYPESAFE_API_KEY   # optional: skip to deploy with the Demo mock
npm run deploy
```

To try the Workers build locally, copy `.dev.vars.example` to `.dev.vars` (Wrangler reads that file, not `.env.local`) and run `npm run preview` (http://localhost:8787).

Pages are prerendered at build time only, so the read-only static assets cache is used and no R2 bucket or KV namespace is needed.

`patches/@opennextjs+cloudflare+1.20.10.patch` (applied by `patch-package` on install) makes the adapter inline Next.js 16.4's `preview-props.json`. Without it every server-rendered request returns a 500. Remove the patch once [opennextjs-cloudflare#1356](https://github.com/opennextjs/opennextjs-cloudflare/pull/1356) is released.

### Rate limiting

On Workers, `POST /api/moderate` is rate limited with Cloudflare's [Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/). These limits are well above what a few testers will send, and they cap TypeSafe spend if the URL is shared:

- 30 messages per minute per IP address
- 120 messages per minute across all users

Over the limit, the API returns `429` with `Retry-After: 60`, and the chat shows "You're sending messages too quickly." Cloudflare counts these limits per location and they are approximate. Rate limiting is skipped under `npm run dev` and `npm start`.

## Scripts

- `npm run dev`: dev server on port 4317
- `npm run build` / `npm start`: production build and server (port 4317)
- `npm run preview`: build for Workers and run it locally in Wrangler (port 8787)
- `npm run deploy`: build for Workers and deploy to Cloudflare
- `npm run lint`: ESLint

The TypeSafe agent skill is vendored in `.agents/skills/typesafe-ai` (installed with `npx skills add typesafe-ai/skills --skill typesafe-ai`).
