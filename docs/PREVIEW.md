# Cloudflare v1 preview

This guide implements [#29](https://github.com/igrady2/cant-bleep-this/issues/29).
The preview is an independent Worker and D1 database, separate from production
and indigogrady.com. Production domain cutover to cantbleepthis.com remains a
launch task ([#32](https://github.com/igrady2/cant-bleep-this/issues/32)).

Read [SECRETS.md](SECRETS.md), [ADMIN_ACCESS.md](ADMIN_ACCESS.md), and
[RETENTION.md](RETENTION.md) alongside this guide. Commands below are setup
instructions, not evidence that a deployment has happened. All angle-bracket
values are placeholders; replace them locally. Never paste real secrets, device
recovery tokens, Access JWTs, or private configuration into git, PRs, or logs.

## Independent preview Worker and configuration

The checked-in wrangler.jsonc names the production Worker cant-bleep-this (with an
all-zero, local-only D1 ID) and includes a named env.preview environment. The
preview environment uses D1 database cant-bleep-this-preview with ID
61ff85c7-06db-4f66-9301-e91e7e3011dc and rate-limit namespaces 4321–4324. The
checked-in block is equivalent to:

~~~jsonc
"env": {
  "preview": {
    "name": "cant-bleep-this-preview",
    "workers_dev": true,
    "d1_databases": [{
      "binding": "DB",
      "database_name": "cant-bleep-this-preview",
      "database_id": "61ff85c7-06db-4f66-9301-e91e7e3011dc",
      "migrations_dir": "migrations"
    }],
    "ratelimits": [
      { "name": "MODERATE_PER_IP_LIMITER", "namespace_id": "4321", "simple": { "limit": 30, "period": 60 } },
      { "name": "MODERATE_GLOBAL_LIMITER", "namespace_id": "4322", "simple": { "limit": 120, "period": 60 } },
      { "name": "REVIEW_PER_IP_LIMITER", "namespace_id": "4323", "simple": { "limit": 30, "period": 60 } },
      { "name": "REVIEW_GLOBAL_LIMITER", "namespace_id": "4324", "simple": { "limit": 120, "period": 60 } }
    ],
    "triggers": { "crons": ["0 4 * * *"] }
  }
}
~~~

The preview rate-limit namespace IDs (4321–4324) are distinct from
production's 4317–4320. Redeclare bindings and any vars in the
named environment; do not assume they inherit. Preserve the top-level main
custom-worker.ts, assets directory .open-next/assets with ASSETS binding,
compatibility date and flags, and observability. The custom entry wraps OpenNext
and supplies scheduled(); deploying the generated worker directly loses retention.
No R2, KV, or Pages project is needed. Do not add production routes to preview.

Configuration references: [Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/),
[D1 environments](https://developers.cloudflare.com/d1/configuration/environments/), and
[OpenNext CLI environment options](https://opennext.js.org/cloudflare/cli).

## D1 creation, binding, and migrations

Authenticate to the intended Cloudflare account, then create a dedicated database:

~~~bash
npx wrangler login
npx wrangler d1 create cant-bleep-this-preview
~~~

The created ID (61ff85c7-06db-4f66-9301-e91e7e3011dc) is already in
env.preview.d1_databases[0].database_id; if recreated, update it and keep binding
DB exactly. Confirm account, database name and ID differ from production before
applying anything remotely. preview_database_id is for Wrangler dev; it does not
select the database of a deployed preview Worker.

~~~bash
npx wrangler d1 migrations list cant-bleep-this-preview --env preview --remote
npx wrangler d1 migrations apply cant-bleep-this-preview --env preview --remote
npx wrangler d1 migrations list cant-bleep-this-preview --env preview --remote
~~~

Apply all existing numbered migrations from migrations/; create or edit none for
this issue. The final list must show none pending. The same DB binding serves
claims, posts, reviews, board, admin, and retention.

## Turnstile, Jev, and private runtime values

Create a preview Turnstile widget in Cloudflare. Allow the exact deployed hostname
(e.g. cant-bleep-this-preview.<WORKERS_SUBDOMAIN>.workers.dev), without a scheme
or path, and any custom preview hostname actually used. Supply its public
NEXT_PUBLIC_TURNSTILE_SITE_KEY in the build environment before OpenNext builds
(gitignored .env.local/.env.production for a local build, or the preview Workers
Builds trigger's build variables). A runtime var or .dev.vars entry cannot change
an already built client bundle. Rebuild after a site-key change.

Set private values interactively on the preview environment only. Each command
prompts for a value; none belongs inline in a command or in committed config:

~~~bash
npx wrangler secret put TYPESAFE_API_KEY --env preview
npx wrangler secret put TURNSTILE_SECRET_KEY --env preview
npx wrangler secret put IP_HASH_SALT --env preview
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN --env preview
npx wrangler secret put CF_ACCESS_AUD --env preview
~~~

Use the verification secret matching the preview Turnstile widget and a long,
random, preview-specific IP_HASH_SALT. The salt hashes the IP for the three-claims
per-IP per-UTC-day cap; it is separate from player device tokens. TYPESAFE_API_KEY
is required for Jev username validation as well as posting. Missing keys or
provider failures fail closed. There is no offline moderation fallback.
TYPESAFE_MODEL defaults to jev-latest. Optional runtime overrides belong in the
preview vars block; see SECRETS.md. Avoid overrides for the initial v1 smoke run.
Secrets do not transfer from production or from a renamed Worker.

No live paid Jev runs without Indigo's approval and an agreed call count
([PROCESS.md](PROCESS.md#tests-and-paid-api-runs)). Include name checks, posts,
and retries in that count. Do not run live seed or filter evaluations as part of
this smoke test. Automated tests must mock Jev.

## Admin and Cloudflare Access

Follow [the manual Access setup](ADMIN_ACCESS.md#setup-manual-in-the-cloudflare-dashboard)
for the preview hostname. Use an email-only Allow policy for the maintainer and
the preview application's AUD, with the team domain in CF_ACCESS_TEAM_DOMAIN.
There is no separate admin password. Protect /admin and /api/admin including
subpaths on each custom hostname. For workers.dev or Preview URLs, enable Access
in the Worker's Domains & Routes and edit the generated application's policy;
that protection may cover the whole hostname, so testers must be allowed through
it before gameplay can be tested. Use a custom preview hostname with path-based
Access if gameplay needs to remain public.

The Worker verifies signed Access JWTs on the page and every admin API. Without
configuration it returns 403; without a token it returns 401; invalid tokens get
403. Local preview has no Access login or bypass. Unit tests use generated signing
keys for positive admin coverage. Test unapproved email rejection remotely too.

## Build, dry-run, deploy, and cron

After dependencies are installed, with the public site key set for the build:

~~~bash
npm run lint
npm run typegen
npm run typecheck
npm test
npm run build
npx opennextjs-cloudflare build --env preview
npx wrangler deploy --env preview --dry-run
~~~

The Next.js build alone does not generate the OpenNext Worker. Inspect the
Wrangler dry-run for the preview Worker, DB, ASSETS, and all four rate-limit
bindings before deploying. Dry-run does not provision a database, apply remote
migrations, validate secrets, or exercise Access, Turnstile, Jev, or cron delivery.
Once manual setup is complete, deploy the built artifact explicitly:

~~~bash
npx wrangler deploy --env preview
~~~

Do not use the unqualified npm run deploy for this environment. If using Workers
Builds, set both build and deploy commands to target preview; the deployment API
token belongs in Workers Builds settings, not Worker runtime secrets or this repo.

Confirm the deployed preview has cron 0 4 * * * (04:00 UTC nightly) and
observability enabled. Check a scheduled invocation's retention summary in Worker
logs against the preview DB. For a local scheduled-handler check after an OpenNext
build, use the default local DB and shared .wrangler/state persistence:

~~~bash
npx wrangler d1 migrations apply cant-bleep-this --local
npx wrangler dev --test-scheduled
~~~

Open http://localhost:8787/__scheduled?cron=0+4+*+*+* and inspect the retention
summary. Use disposable synthetic expired/current rows locally; this endpoint
executes deletes, it is not a dry-run. See RETENTION.md for 90-day boundaries,
name release, banned-name preservation, permanent test cases, and batching.

## Preview smoke checklist

Check a box only after recording evidence. **Local/mock** means automated coverage
or a local Workers run can verify behavior without paid Jev; it does not establish
that deployed services are configured correctly. **Remote** requires the live
preview and, for claims/posts, the approved paid-call budget. Use separate browser
profiles for author and independent reviewers; respect the three-claims-per-IP cap
(use existing test players or separate tester IPs rather than weakening the cap).

- [ ] **Deployment / D1 — local dry-run + remote:** inspect target and bindings;
  confirm migrations have no pending entries and the deployed app loads.
- [ ] **Claims — local/mock + remote:** confirm age/onboarding flow, valid Turnstile
  claim, saved recovery code and reload/recovery; reject invalid/reserved/lookalike
  names, bad verification, and the fourth daily claim. Confirm only token hashes
  and salted IP hashes are stored. Successful live claims may call Jev.
- [ ] **Posting — local/mock + remote:** an authenticated message of at most 140
  characters appears in /api/feed; check context, retry/idempotency, daily caps,
  and review-required behavior. Missing/failed Jev must post nothing and show a
  retryable error. Test provider failures with mocks, not deliberate paid retries.
- [ ] **Blocked review — local/mock + remote:** an ordinary blocked message stays
  out of the public feed but reaches an eligible non-author via /judge and
  /api/review/queue. Skip satisfies the review requirement without a verdict;
  self-review is refused. Off-limits content never reaches feed, queue or context;
  use synthetic mocked cases for that check, never real off-limits material.
- [ ] **Consensus — local/mock + remote:** two matching eligible reviews decide
  passed + Not OK = slip, passed + Fine = clean, blocked + Not OK = caught,
  blocked + Fine = false_positive. At most one deciding review is hand-picked;
  obtain the others from the server queue. Duplicate votes do not duplicate points
  or permanent anonymized test cases.
- [ ] **Censorship — local/mock + remote:** a confirmed slip masks vowels only in
  the union of the deciding Not OK spans; empty selections and no-vowel spans
  follow PRD rules. Refresh and context stay censored. Contact information stays
  masked even for reviewers; maintainer-deleted messages disappear.
- [ ] **Board — local/mock + remote:** /board and /api/board show the slip author's
  point once, within the 90 UTC score-day window; banned players are absent.
  Confirm patched-release labels do not remove earned points.
- [ ] **Admin — local/mock denial and signed-JWT tests + remote maintainer:**
  unauthorized page/API requests fail; Access admits only the approved email.
  Inspect slips/false positives and persist a trick tag. Verify moderation delete
  and ban actions against disposable preview data, including removal from feed
  and board. Do not publish credentials or JWTs as evidence.
- [ ] **Retention — local/mock scheduled handler + remote cron:** expired game rows
  are removed, inactive unbanned names released, banned names retained, kept
  context has no dangling IDs, and permanent test_cases survive. Rerun is safe;
  confirm the deployed scheduled invocation and summary at 04:00 UTC. Local
  /__scheduled proves handler execution, not Cloudflare trigger delivery.

## Manual / Setup Guide

Indigo performs these live Cloudflare steps; this docs-only change provisions nothing:

1. Select the account and independent preview Worker/hostname; prepare env.preview,
   isolated rate-limit namespaces and a dedicated D1 DB ID. Apply existing migrations.
2. Create the preview Turnstile widget, allow its hostname, and set the public site
   key on the preview build trigger before building.
3. Enter TYPESAFE_API_KEY, TURNSTILE_SECRET_KEY, and IP_HASH_SALT interactively with
   the secret-put commands above. Keep real values out of documentation.
4. Create/configure preview Access, maintainer email policy, team domain and AUD;
   set its two runtime values on the matching Worker. Check every served hostname.
5. Configure preview build/deploy targeting, deployment authentication if needed,
   DB and rate-limit bindings, custom-worker.ts entry, cron and observability;
   inspect dry-run, then deploy.
6. Approve a bounded Jev call count before claims/posts. Run the checklist, including
   maintainer-only admin and remote retention checks, and record evidence below.

## Preview URL and verification record

Record the actual preview URL and results in this document or the PR, including
commit SHA, date, tester, each checklist outcome, sanitized evidence, and blockers.
Record the approved/actual Jev call counts without API values. Do not treat a local
pass as a remote pass or claim deployment complete while manual checks remain.

- Preview URL: **Not deployed/verified in this workspace; Indigo to record.**
- Live smoke results: **Not run; pending manual Cloudflare setup and paid-call approval.**
- Automated verification: lint, typegen, typecheck, test, and build pass in CI on the merged commit. No live API calls, remote migrations, or deployments were performed.
- Preview build check (2026-10-16, main at 3dfacbc, Claude Code): `opennextjs-cloudflare build --env preview` and `wrangler deploy --env preview --dry-run` pass. Dry-run bindings: DB → cant-bleep-this-preview, the four rate limiters, ASSETS. Bundle 11.1 MB raw / 2.6 MB gzip. Nothing was deployed.
- Preview D1: all 14 migrations applied remotely with none pending (reported by the Setup Guide agent on 2026-10-15; not re-checked from this workspace).
- Production domain cutover: **Deferred to launch (#32).**
