<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Engineering guide

Can't Bleep This is a chat game where players try to get messages past a filter and other players judge them. Read [docs/PRD.md](docs/PRD.md) before starting an issue; it is the source of truth for behavior. If an issue and the PRD disagree, stop and ask in the issue instead of picking one.

## Working on an issue

- One issue per PR. Keep the PR to what the issue's "Done" list asks for; open a new issue for anything else you find.
- Check the issue's "Depends on" line. Don't start until those issues are merged.
- In the PR description, link the issue (`Closes #N`) and the PRD section it implements, and say how you verified each "Done" item.
- Before opening the PR, run `npm run lint`, `npx tsc --noEmit` and `npm run build`. Run the tests once they exist (see Testing).

## Stack

- Next.js on Cloudflare Workers through OpenNext (`wrangler.jsonc`, `open-next.config.ts`). This is a Worker, not Cloudflare Pages: no Pages Functions, no `_routes.json`.
- `npm run dev` runs plain Next.js with no Cloudflare bindings. Use `npm run preview` to test anything that needs D1, rate limits, cron or secrets; it reads `.dev.vars`.
- Read bindings with `getCloudflareContext()` from `@opennextjs/cloudflare` and declare their types on the global `CloudflareEnv` interface, as `src/lib/rate-limit.ts` does.

## Code layout

- API routes: `src/app/api/<name>/route.ts`. Keep them thin: parse and validate input, call a library function, return JSON.
- Server logic: `src/lib/<area>/`, starting with `import "server-only";`. Areas so far: `moderation`. Add `db`, `players`, `reviews` and so on as issues need them.
- UI: `src/components/<area>/`, using the existing `src/components/ui` primitives and Tailwind.
- Every error response is `Response.json({ error: "<one plain sentence a player can read>" }, { status })`, matching `src/app/api/moderate/route.ts`. Never return stack traces or provider messages; log details with `console.error("[area]", err)`.

## Rules that are easy to get wrong

- **No fallback when Jev fails.** If a check can't reach Jev (missing key, error, timeout, bad response), nothing is posted or claimed and the player sees a retryable error. Never fall back to keywords or to "allow".
- **One Jev request per check.** All rule questions, plus the off-limits question, go in the same request, with the last 10 messages and the room's usernames as context. Player text is always data, never instructions.
- **Mask before showing.** Phone numbers, emails and long digit runs are masked before any player, reviewer, admin view or test case sees text. Use the shared masking helper (#11); don't write your own.
- **Off-limits content never leaves the server** (feed, queue, context, test set).
- **The server decides.** Scores, verdicts, review requirements, hand-picked limits and caps are enforced server-side. Never trust a client-sent flag.
- **Secrets** go through `npx wrangler secret put` and `.dev.vars` (gitignored). Never commit keys, salts or tokens. Store only hashes of player tokens and IPs.
- **Thresholds and limits are configuration**, not constants buried in code, wherever the PRD says a number is tunable.

## Database (D1)

- One D1 database bound as `DB`. Migrations live in `migrations/` as numbered SQL files created with `npx wrangler d1 migrations create <db-name> <short_name>`. Never edit a migration that is already on main; add a new one.
- Apply locally with `npx wrangler d1 migrations apply <db-name> --local`.
- Use prepared statements with bound parameters only; never build SQL with string interpolation.
- Write paths that must not double count (scores, verdicts, claims) use a single `batch()` or a unique constraint, so retries are safe.

## Testing

- There is no test runner yet. The first issue that needs tests adds Vitest with `@cloudflare/vitest-pool-workers` and an `npm test` script; later issues reuse it.
- Test library functions directly: name rules, masking, verdict logic, the review requirement and caps. Mock the Jev HTTP call in tests; never call the live API from tests.
- Fixtures are synthetic and masked. Never put real personal information, or any off-limits content, in the repo.
