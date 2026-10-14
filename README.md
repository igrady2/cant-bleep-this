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

### D1 persistence and local preview

The game database is bound as `DB` in `wrangler.jsonc`, with numbered SQL
migrations in `migrations/`. The checked-in all-zero database ID is a local-only
placeholder, not a remote database. Local migrations and preview need no
Cloudflare login:

```bash
npx wrangler d1 migrations apply cant-bleep-this --local
npx wrangler d1 migrations list cant-bleep-this --local
cp .dev.vars.example .dev.vars   # if you have not created it yet
npm run preview                 # http://localhost:8787
```

Wrangler migrations and preview share the default `.wrangler/state` local
database. Keep that persistence path the same for both commands. `npm run dev`
runs plain Next.js and has no D1 binding. The schema is a persistence foundation;
game endpoints do not use it yet.

To inspect the local schema:

```bash
npx wrangler d1 execute cant-bleep-this --local --command="SELECT name, type FROM sqlite_master WHERE type IN ('table', 'index', 'trigger') ORDER BY type, name"
```

Create future migrations with
`npx wrangler d1 migrations create cant-bleep-this <short_name>`.
Never edit a migration already merged to main.

**Remote setup (manual):** create or select the game's D1 database in your
Cloudflare account, replace `database_id` with its real ID, and confirm the
intended environment before authorizing
`npx wrangler d1 migrations apply cant-bleep-this --remote`. If you use a
separate remote preview database, supply its ID as `preview_database_id`;
the local preview command above does not need one. Do not deploy the placeholder.

Schema conventions:

- IDs are server-generated text identifiers; timestamps are UTC Unix seconds,
  and score days are UTC `YYYY-MM-DD`. Only SHA-256 token hashes are stored.
- Context message IDs and test-case context/reasons are JSON arrays; per-rule
  filter scores are a JSON object. `top_score` is their highest score.
- `filter_outcome` is immutable; `status` records the later player verdict or
  exclusion. Off-limits/deleted messages use `excluded` and must never be
  returned in feed, queue, context, or test cases.
- Each review targets exactly one message or seed test case. `seed_correct`
  is nullable and belongs only to seed reviews; skipped reviews have no verdict
  or correctness. `assignment` is set by the server. Reviewer standing is a
  cached `good`/`excluded` value recomputed after seed reviews using settings.
- Normalized names and player/message review pairs are unique. Daily scores
  have one row per player/day. Queue, feed, retention, seed-check and board
  queries have indexes.
- Permanent test cases have no foreign keys to expiring game rows. Their message,
  context and reasons must be masked and anonymized before insertion, using the
  shared masking helper when implemented. The schema does not perform masking.
  No retention job or assignment reservations are implemented here.

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
