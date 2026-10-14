# Can't Bleep This

**Get it past the filter.** A chat game in development, currently built on a small moderated chat demo. Type a message and press **Enter** to send. Before it is added to the chat log, the server sends it to **Jev**, the flagship System One model from [TypeSafe AI](https://docs.typesafe.ai). Allowed messages are posted. Blocked messages are not posted; instead the author sees which categories were flagged and why.

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

- **state**: the existing demo context and the message. The author's role is not sent. Issue #4 replaces the rule questions and explanations with the game policy.
- **questions**: one [Noul](https://docs.typesafe.ai/primitives/noul) (yes/no probability) question per category. Each category is a separate question because several can apply to the same message. The questions run in parallel within that one request.

The rule is applied in code: if any category reaches the threshold, the message is blocked. The response returns every category's probability, so you can tune the threshold without changing the questions. If the moderation service fails, the message is not posted, and the UI shows an error with a Retry button.

### Categories (`src/lib/moderation/categories.ts`)

The current demo categories and explanations remain in `src/lib/moderation/categories.ts`. Issue #4 replaces them with the game policy; this identity rename does not change moderation behavior.

## Deploy to Cloudflare Workers

The app runs on Cloudflare Workers through the [OpenNext Cloudflare adapter](https://opennext.js.org/cloudflare). The Worker name is `cant-bleep-this`. Configuration is in `wrangler.jsonc` and `open-next.config.ts`.

When deploying under the new name, confirm `cant-bleep-this` in your Cloudflare account and re-set `TYPESAFE_API_KEY` and any other existing Worker secrets on that Worker. Secrets do not transfer when the config name changes.

```bash
npx wrangler login
npx wrangler secret put TYPESAFE_API_KEY --name cant-bleep-this   # optional for the current Demo mock
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

## Message presentation

`src/lib/presentation` masks emails and digit runs before returning text. Set
`MASK_MIN_DIGITS` to a positive integer (default **7**). Single spaces, hyphens,
dots and parentheses may separate the digits: `555-0100`, `(787) 555-0100` and
`+1 787 555 0100` are all masked by the default. Invalid configuration fails
closed rather than returning raw text. Moderation still checks the original input.

Use `serializePublicMessage`, `serializeReviewerMessage` and `serializeTestCase`
at their respective output boundaries. They project only known presentation
fields and re-mask message text, usernames, context and reasons. Public messages
with a server-confirmed `slipRule` show `█████` and that rule; reviewers and test
cases retain the policy-violating words with contact details redacted. These
helpers do not replace off-limits filtering or dataset username anonymization.
The review queue and permanent dataset exporter are not implemented yet and must
use these helpers when added. The existing demo uses the masked API response for
both its message list and blocked-message notice.

Run `npm test` for the synthetic masking, serialization and API-boundary tests
in the Cloudflare Workers runtime. No test calls the live Jev API.
