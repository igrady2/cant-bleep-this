# Secrets and environment variables

Nothing in this file is a secret value. Committed templates (`.env.example`, `.dev.vars.example`) only show empty placeholders. Real keys, salts, and tokens stay out of git, issues, and logs.

Player device tokens are not environment variables. The server stores only their SHA-256 hashes.

## Where each environment reads config

| Environment | How it is configured |
| --- | --- |
| Local (`npm run dev`) | Next.js reads `.env.local`. Copy `.env.example` to `.env.local`. `.env.local` is gitignored. This process has no D1, rate-limit, or other Worker bindings. |
| Local preview (`npm run preview`) | Wrangler reads `.dev.vars`, not `.env.local`. Copy `.dev.vars.example` to `.dev.vars`. `.dev.vars` is gitignored. Bindings come from `wrangler.jsonc`. |
| Remote preview | A separate preview Worker. Set private values with `npx wrangler secret put <NAME>` on that Worker. Public overrides go in Wrangler `vars` or the dashboard. Manual. See [#29](https://github.com/igrady2/cant-bleep-this/issues/29). |
| Production | Worker name `cant-bleep-this` at cantbleepthis.com. Set private values with `npx wrangler secret put <NAME> --name cant-bleep-this`. Public overrides go in the `vars` block of `wrangler.jsonc` (or the dashboard). Manual. See [#32](https://github.com/igrady2/cant-bleep-this/issues/32). |

Secrets do not move with a Worker rename. After the name change to `cant-bleep-this`, set them again on the new Worker ([#36](https://github.com/igrady2/cant-bleep-this/issues/36)).

CI (`.github/workflows/ci.yml`) does not receive or need these values. Do not put them in GitHub Actions secrets for that workflow.

## Variables the app reads today

These names come from `.env.example`, `.dev.vars.example`, `wrangler.jsonc`, and the code that reads `process.env`.

| Name | Kind | Local | Preview | Production | Manual? |
| --- | --- | --- | --- | --- | --- |
| `TYPESAFE_API_KEY` | Secret. TypeSafe API key. When set, Jev scores messages. When unset, the current demo uses the local keyword mock. [#6](https://github.com/igrady2/cant-bleep-this/issues/6) removes that fallback: a missing key must then fail closed. | `.env.local`. Leave empty to use the mock. | Local: `.dev.vars`. Remote preview: Worker secret. | Worker secret: `npx wrangler secret put TYPESAFE_API_KEY --name cant-bleep-this`. | Yes. Never commit the key. |
| `TYPESAFE_MODEL` | Optional config. Model name. Default `jev-latest` in code. | `.env.local` | `.dev.vars`, or Wrangler `vars` on a remote Worker. | Wrangler `vars`, not a secret. | Only if you override the default. |
| `MODERATION_THRESHOLD` | Optional config. Probability at which a category blocks a message. Default `0.5` in code. | `.env.local` | `.dev.vars`, or Wrangler `vars` on a remote Worker. | Wrangler `vars`, not a secret. | Only if you override the default. |
| `MODERATION_PROVIDER` | Optional config. Set to `mock` to force the local mock even when a key is present. | `.env.local` | `.dev.vars`, or Wrangler `vars` on a remote Worker. | Wrangler `vars`, not a secret. Do not set `mock` on the live game. | Only if you force the mock. |
| `MASK_MIN_DIGITS` | Optional config. Minimum digits masked in a phone-like run. Default `7` in code. Invalid values fail closed. | `.env.local` | `.dev.vars`, or Wrangler `vars` on a remote Worker. | Wrangler `vars`, not a secret. | Only if you override the default. |

`wrangler.jsonc` documents the same split: `TYPESAFE_API_KEY` is a secret (`npx wrangler secret put TYPESAFE_API_KEY`). `TYPESAFE_MODEL`, `MODERATION_THRESHOLD`, and `MODERATION_PROVIDER` belong in `vars` when overriding them on a Worker. `.dev.vars.example` currently lists only `TYPESAFE_API_KEY`; add the optional names there locally if a preview run needs them. Do not add real values to the example files.

## Planned secrets (not read by code yet)

Issues name these, and the app does not reference them yet. Use the names below when the issues land so local, preview, and production stay aligned. Set every private value manually. Do not commit any of them.

| Name | Kind | Local | Preview | Production | Manual? | Issue |
| --- | --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public Turnstile site key. The browser needs it, so the Next client bundle only sees a `NEXT_PUBLIC_` variable. | `.env.local` | Local: `.dev.vars` (and `.env.local` if the client bundle is built by `npm run preview`). Remote: Wrangler `vars` or the Turnstile hostname's widget config. Also allow the preview hostname on the Turnstile site. | Wrangler `vars` or the production build env. Allow the production hostname (cantbleepthis.com) on the Turnstile site. | Yes. Create the Turnstile widget in Cloudflare first. The site key is public; still do not treat the example files as a place to paste it. | [#9](https://github.com/igrady2/cant-bleep-this/issues/9), [#10](https://github.com/igrady2/cant-bleep-this/issues/10), [#29](https://github.com/igrady2/cant-bleep-this/issues/29), [#32](https://github.com/igrady2/cant-bleep-this/issues/32) |
| `TURNSTILE_SECRET_KEY` | Secret. Server-side Turnstile verification. | `.env.local` | Local: `.dev.vars`. Remote preview: Worker secret. | Worker secret: `npx wrangler secret put TURNSTILE_SECRET_KEY --name cant-bleep-this`. | Yes. | [#9](https://github.com/igrady2/cant-bleep-this/issues/9), [#29](https://github.com/igrady2/cant-bleep-this/issues/29) |
| `IP_HASH_SALT` | Secret. Salt for the daily name-claim cap (3 per IP). Only the salted hash is stored; raw IPs are not. | `.env.local` | Local: `.dev.vars`. Remote preview: Worker secret. | Worker secret: `npx wrangler secret put IP_HASH_SALT --name cant-bleep-this`. | Yes. Use a long random value, different from any other secret. | [#9](https://github.com/igrady2/cant-bleep-this/issues/9), [#29](https://github.com/igrady2/cant-bleep-this/issues/29) |
| `CF_ACCESS_TEAM_DOMAIN` | Access team domain, used with the audience tag to verify the Access JWT on `/admin` API routes (for example `https://<team>.cloudflareaccess.com`). Not a password. Keep it off the client. | `.env.local` if you exercise admin routes locally. | Local: `.dev.vars`. Remote preview: Worker secret or `vars`, after the Access application exists for the preview hostname. | Worker secret or `vars`, after the Access application exists for the production hostname. | Yes. Create the Access application (free plan, email allow policy for the maintainer) in the Cloudflare dashboard. | [#23](https://github.com/igrady2/cant-bleep-this/issues/23) |
| `CF_ACCESS_AUD` | Cloudflare Access application audience (AUD) tag. The Worker checks it when verifying the Access JWT so `/admin` cannot be called around Access. Not a password, but it identifies the private application. Do not commit it. | `.env.local` if you exercise admin routes locally. | Local: `.dev.vars`. Remote preview: Worker secret. | Worker secret: `npx wrangler secret put CF_ACCESS_AUD --name cant-bleep-this`. | Yes. Copy the audience tag from the Access application. One tag per application, so preview and production differ. | [#23](https://github.com/igrady2/cant-bleep-this/issues/23), [#29](https://github.com/igrady2/cant-bleep-this/issues/29) |

[#29](https://github.com/igrady2/cant-bleep-this/issues/29) also says to set "the chosen admin credential where required." [#23](https://github.com/igrady2/cant-bleep-this/issues/23) decides that protection is Cloudflare Access with an email allow policy, so there is no admin password to store. Do not add one unless a later issue requires it. If it ever is required, set it with `npx wrangler secret put` and do not commit it.

## Worker bindings in `wrangler.jsonc` (not env secrets)

| Binding | What it is | How it is set | Manual? |
| --- | --- | --- | --- |
| `DB` | D1 database `cant-bleep-this`. `database_id` in `wrangler.jsonc` is a local-only placeholder. | Local preview uses the placeholder and `.wrangler/state`. Before any remote preview or production use, replace `database_id` with the real D1 id from the Cloudflare account. A separate remote preview database uses `preview_database_id`. Apply migrations with `npx wrangler d1 migrations apply cant-bleep-this --local` or `--remote` only after you mean to. | Yes for any remote database. |
| `MODERATE_PER_IP_LIMITER` | Rate limit binding, 30 requests per 60 seconds per IP, namespace `4317`. | Declared in `wrangler.jsonc`. Not a secret. Absent under `npm run dev`. | No. Change the limit in config if you tune it. |
| `MODERATE_GLOBAL_LIMITER` | Rate limit binding, 120 requests per 60 seconds for the whole Worker, namespace `4318`. | Declared in `wrangler.jsonc`. Not a secret. Absent under `npm run dev`. | No. Change the limit in config if you tune it. |

No R2 bucket, KV namespace, or Pages `_routes.json` is required.
