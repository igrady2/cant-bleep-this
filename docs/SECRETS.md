# Secrets and environment variables

Nothing in this file is a secret value. Committed templates (`.env.example`, `.dev.vars.example`) only show empty placeholders. Real keys, salts, and tokens stay out of git, issues, and logs.

Player device tokens are not environment variables. The server stores only their SHA-256 hashes.

For the independent preview deployment, manual setup, and verification checklist,
see [PREVIEW.md](PREVIEW.md).

## Where each environment reads config

| Environment | How it is configured |
| --- | --- |
| Local (`npm run dev`) | Next.js reads `.env.local`. Copy `.env.example` to `.env.local`. `.env.local` is gitignored. This process has no D1, rate-limit, or other Worker bindings. |
| Local preview (`npm run preview`) | Wrangler reads `.dev.vars`, not `.env.local`. Copy `.dev.vars.example` to `.dev.vars`. `.dev.vars` is gitignored. Bindings come from `wrangler.jsonc`. |
| Remote preview | A separate preview Worker. Set private runtime values with `npx wrangler secret put <NAME>` on that Worker. Non-secret runtime overrides go in Wrangler `vars` or the dashboard. `NEXT_PUBLIC_` values are build-time only (see below). Manual. See [#29](https://github.com/igrady2/cant-bleep-this/issues/29). |
| Production | Worker name `cant-bleep-this` at cantbleepthis.com. Set private runtime values with `npx wrangler secret put <NAME> --name cant-bleep-this`. Non-secret runtime overrides go in the `vars` block of `wrangler.jsonc` (or the dashboard). `NEXT_PUBLIC_` values are build-time only (see below). Manual. See [#32](https://github.com/igrady2/cant-bleep-this/issues/32). |

Secrets do not move with a Worker rename. After the name change to `cant-bleep-this`, set them again on the new Worker ([#36](https://github.com/igrady2/cant-bleep-this/issues/36)).

Next.js inlines every `NEXT_PUBLIC_` value into the client bundle when `next build` or `opennextjs-cloudflare build` runs. Set those on the build, including Workers Builds > Settings > Builds > Variables and secrets for that trigger. A Wrangler runtime var, a Worker secret, or a `.dev.vars` entry does not change a bundle that is already built. Runtime secrets and `vars` are for server code after deploy.

CI (`.github/workflows/ci.yml`) does not receive or need these values, and it does not deploy. Do not put them in GitHub Actions secrets for that workflow.

## Variables the app reads today

These names come from `.env.example`, `.dev.vars.example`, `wrangler.jsonc`, and the code that reads `process.env`.

| Name | Kind | Local | Preview | Production | Manual? |
| --- | --- | --- | --- | --- | --- |
| `TYPESAFE_API_KEY` | Secret. TypeSafe API key. **Required** for posting messages; Jev scores every check. A missing key fails closed (nothing posted). | `.env.local` | Local: `.dev.vars`. Remote preview: Worker secret. | Worker secret: `npx wrangler secret put TYPESAFE_API_KEY --name cant-bleep-this`. | Yes. Never commit the key. |
| `TYPESAFE_MODEL` | Optional config. Model name. Default `jev-latest` in code. | `.env.local` | `.dev.vars`, or Wrangler `vars` on a remote Worker. | Wrangler `vars`, not a secret. | Only if you override the default. |
| `MODERATION_THRESHOLD` | Optional runtime config. The single probability the current code applies to every reviewable category. Default `0.5`. Per-rule thresholds are separate settings below; this variable is not a substitute for them. | `.env.local` | `.dev.vars`, or Wrangler `vars` on a remote Worker. | Wrangler `vars`. Not a secret. | Only if you override the default. |
| `MODERATION_THRESHOLD_OFF_LIMITS` | Optional runtime config. Independent threshold for the `off_limits` exclusion question. Default `0.5`. | `.env.local` | `.dev.vars`, or Wrangler `vars` on a remote Worker. | Wrangler `vars`. Not a secret. | Only if you override the default. |
| `MASK_MIN_DIGITS` | Optional config. Minimum digits masked in a phone-like run. Default `7` in code. Invalid values fail closed. | `.env.local` | `.dev.vars`, or Wrangler `vars` on a remote Worker. | Wrangler `vars`, not a secret. | Only if you override the default. |
| `TURNSTILE_SECRET_KEY` | Secret. Server-side Turnstile verification for `POST /api/claim`. | `.env.local` | Local: `.dev.vars`. Remote preview: Worker secret. | Worker secret: `npx wrangler secret put TURNSTILE_SECRET_KEY --name cant-bleep-this`. | Yes. |
| `IP_HASH_SALT` | Secret. Salt for the daily name-claim cap (3 per IP). Only the salted hash is stored. | `.env.local` | Local: `.dev.vars`. Remote preview: Worker secret. | Worker secret: `npx wrangler secret put IP_HASH_SALT --name cant-bleep-this`. | Yes. Use a long random value, different from any other secret. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public Turnstile site key for the name-claim widget. Build-time only: Next.js inlines it into the client bundle. Do not set it as a Wrangler runtime var, a Worker secret, or a `.dev.vars` entry. | `.env.local`, read by `npm run dev` and by `next build`. | Present in the environment when `opennextjs-cloudflare build` runs (gitignored `.env.local` or `.env.production` for a local preview build). Remote preview: Workers Builds variable on the preview trigger, not a runtime var. Also allow the preview hostname on the Turnstile widget. | Workers Builds variable on the production trigger, present when `opennextjs-cloudflare build` runs. Also allow cantbleepthis.com on the Turnstile widget. | Yes. Create the Turnstile widget in Cloudflare first. The site key is public. Do not commit it. |

`wrangler.jsonc` documents the same split: `TYPESAFE_API_KEY` is a secret (`npx wrangler secret put TYPESAFE_API_KEY`), and so are the admin access values below. `TYPESAFE_MODEL`, `MODERATION_THRESHOLD`, and `MODERATION_THRESHOLD_OFF_LIMITS` belong in `vars` when overriding them on a Worker. `.dev.vars.example` lists `TYPESAFE_API_KEY`, `TURNSTILE_SECRET_KEY`, and `IP_HASH_SALT`; add the optional moderation names there locally if a preview run needs them. Do not add real values to the example files.

## Admin access (Cloudflare Access)

`/admin` and `/api/admin/*` sit behind Cloudflare Access, and the Worker also verifies the Access JWT on every admin request ([#23](https://github.com/igrady2/cant-bleep-this/issues/23)). Full setup, including the manual dashboard steps, is in [ADMIN_ACCESS.md](ADMIN_ACCESS.md). If either value is unset or invalid, every admin request fails closed with `403`.

| Name | Kind | Local | Preview | Production | Manual? |
| --- | --- | --- | --- | --- | --- |
| `CF_ACCESS_TEAM_DOMAIN` | Access team domain, for example `https://<team>.cloudflareaccess.com` (the `https://` is optional). The Worker fetches signing keys from `<team domain>/cdn-cgi/access/certs` and requires `iss` to equal it. Not a password. Server only; never a `NEXT_PUBLIC_` value. | Not needed. With no Access in front of local runs, admin routes stay closed either way. | Worker secret or `vars` on the preview Worker, after its Access application exists. | Worker secret: `npx wrangler secret put CF_ACCESS_TEAM_DOMAIN --name cant-bleep-this` (or Wrangler `vars`). | Yes. Find it under Cloudflare One > Settings. |
| `CF_ACCESS_AUD` | Audience (AUD) tag of the Access application. The Worker requires the JWT's `aud` to contain it, so a token for another Access application is refused. Not a password, but it identifies the private application. Do not commit it. | Not needed (see above). | Worker secret on the preview Worker, copied from the preview Access application. | Worker secret: `npx wrangler secret put CF_ACCESS_AUD --name cant-bleep-this`. | Yes. One tag per Access application, so preview and production differ. |

Manual steps, in order (details in [ADMIN_ACCESS.md](ADMIN_ACCESS.md#setup-manual-in-the-cloudflare-dashboard)):

1. In Cloudflare One (Zero Trust, free plan), note the team domain.
2. Create a self-hosted Access application for each hostname set, covering the paths `admin` and `api/admin` on the production hostname (cantbleepthis.com) and, separately, on each preview hostname. For `workers.dev` or Preview URLs, turn on Cloudflare Access in the Worker's Domains & Routes settings.
3. Give each application a single Allow policy: Include > Emails > the maintainer's email only.
4. Copy each application's AUD tag.
5. Set `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` on the matching Worker (production or preview) with `npx wrangler secret put`.

[#29](https://github.com/igrady2/cant-bleep-this/issues/29) also says to set "the chosen admin credential where required." [#23](https://github.com/igrady2/cant-bleep-this/issues/23) decides that protection is Cloudflare Access with an email allow policy, so there is no admin password to store. Do not add one unless a later issue requires it. If it ever is required, set it with `npx wrangler secret put` and do not commit it.

`NEXT_PUBLIC_TURNSTILE_SITE_KEY` is the only `NEXT_PUBLIC_` variable in this inventory. Any later `NEXT_PUBLIC_` name is also build-time only. Do not list it as a Wrangler runtime var.

## Per-rule and off-limits thresholds

These are runtime configuration, not secrets, and not `NEXT_PUBLIC_` values. Each is a probability. The initial value is **0.5**, and a score equal to the threshold triggers that question. The off-limits threshold is independent of the nine rule thresholds. Change them without a code release ([PRD](PRD.md#our-content-rules), [content rules](CONTENT_RULES.md)). Issue [#12](https://github.com/igrady2/cant-bleep-this/issues/12) owns the off-limits setting. Issue [#15](https://github.com/igrady2/cant-bleep-this/issues/15) reads the current per-rule thresholds when it builds the review queue.

The app reads `MODERATION_THRESHOLD` for every reviewable category and `MODERATION_THRESHOLD_OFF_LIMITS` for the separate exclusion question. It does not read the per-rule names below.

| Name | Stable id | Initial |
| --- | --- | --- |
| `MODERATION_THRESHOLD_BULLYING_HARASSMENT` | `bullying_harassment` | 0.5 |
| `MODERATION_THRESHOLD_HATE_SPEECH` | `hate_speech` | 0.5 |
| `MODERATION_THRESHOLD_SEXUAL_CONTENT` | `sexual_content` | 0.5 |
| `MODERATION_THRESHOLD_VIOLENCE_THREATS` | `violence_threats` | 0.5 |
| `MODERATION_THRESHOLD_SELF_HARM` | `self_harm` | 0.5 |
| `MODERATION_THRESHOLD_PROFANITY` | `profanity` | 0.5 |
| `MODERATION_THRESHOLD_PERSONAL_INFO` | `personal_info` | 0.5 |
| `MODERATION_THRESHOLD_SPAM` | `spam` | 0.5 |
| `MODERATION_THRESHOLD_IMPERSONATION` | `impersonation` | 0.5 |
| `MODERATION_THRESHOLD_OFF_LIMITS` | `off_limits` | 0.5 |

| Environment | Where to set them | Manual? |
| --- | --- | --- |
| Local (`npm run dev`) | `.env.local` | Only when overriding 0.5. |
| Local preview | `.dev.vars` | Only when overriding 0.5. |
| Remote preview and production | Wrangler `vars` (runtime), not Worker secrets and not Workers Builds variables. | Only when overriding 0.5. |

## Cloudflare API token for Workers Builds

| Name | Kind | Local | Preview | Production | Manual? |
| --- | --- | --- | --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Secret. Authenticates non-interactive Wrangler deploys. Workers Builds uses an API token to upload the Worker (Worker > Settings > Builds > API token). Cloudflare can generate that token. It is not a Worker runtime value: do not put it in wrangler `vars`, `wrangler secret put`, or `.dev.vars`. | Shell environment, or a gitignored `.env` file that Wrangler loads. `npx wrangler login` is the interactive alternative and stores nothing in the repo. | Workers Builds preview trigger > Settings > Builds > API token. | Workers Builds production trigger > Settings > Builds > API token. | Yes, when you supply your own token. Never commit it. GitHub Actions CI does not deploy and must not receive this token. |

## Worker bindings in `wrangler.jsonc` (not env secrets)

| Binding | What it is | How it is set | Manual? |
| --- | --- | --- | --- |
| `DB` | D1 binding for database `cant-bleep-this`. The top-level `database_id` in `wrangler.jsonc` is a local-only placeholder. | Local preview (`npm run preview`, Wrangler dev) uses that placeholder and `.wrangler/state`. `preview_database_id` applies only to Wrangler dev. A separately deployed preview Worker does not read it. Give that deployment its own `database_id`, for example in an `env.preview` block, and keep that id different from the production database so preview never binds the production D1 ([D1 environments](https://developers.cloudflare.com/d1/configuration/environments/)). Set the top-level `database_id` to the production D1 id before a production deploy. Apply migrations with `npx wrangler d1 migrations apply cant-bleep-this --local`, or with `--remote` and `--env preview` when the target is the preview environment, only for the database you mean to change. | Yes for any remote database. |
| `MODERATE_PER_IP_LIMITER` | Rate limit binding, 30 requests per 60 seconds per IP, namespace `4317`. | Declared in `wrangler.jsonc`. Not a secret. Absent under `npm run dev`. | No. Change the limit in config if you tune it. |
| `MODERATE_GLOBAL_LIMITER` | Rate limit binding, 120 requests per 60 seconds for the whole Worker, namespace `4318`. | Declared in `wrangler.jsonc`. Not a secret. Absent under `npm run dev`. | No. Change the limit in config if you tune it. |

No R2 bucket, KV namespace, or Pages `_routes.json` is required.
