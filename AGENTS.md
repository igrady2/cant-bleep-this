<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Agent rules

How the project is run: [docs/PROCESS.md](docs/PROCESS.md). How the game should behave: [docs/PRD.md](docs/PRD.md). Read both before starting an issue. If they disagree with an issue, ask in the issue and don't pick one yourself.

## Stack

- Next.js on Cloudflare Workers through OpenNext. Data lives in D1.
- Moderation uses Jev through TypeSafe AI.
- Tests use Vitest. Always mock Jev; never call the live API from tests.
- D1 tests run against real SQLite through the Workers pool binding `REVIEWS_TEST_DB`.

## Commands

Run all four before opening a PR. Each must pass.

```
npm run lint
npm run typecheck
npm test
npm run build
```

## Migrations

- Migrations are numbered SQL files in `migrations/`.
- Create one with `npx wrangler d1 migrations create cant-bleep-this <short_name>`.
- Use the next free number, even if the issue names a different one.
- Never edit an existing migration. Add a new one.

## Dependencies

- Pin exact versions. No `^` or `~`.
- Don't set up automatic updates (Dependabot, Renovate or similar).

## Pull requests

- One PR per issue. Stay within the issue's "Done" list. Anything else goes in a new issue.
- Use `.github/pull_request_template.md`. Fill in "Built by" with the model you actually used.
- Close an issue only after its PR has merged.

## Secrets

- Never put secrets in code, chat, issues, PRs or any other GitHub content.
