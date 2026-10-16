# Data retention

Everything except the permanent test set is deleted after 90 days ([PRD: architecture and free-plan fit](PRD.md#architecture-and-free-plan-fit)). A nightly Workers cron job does the deleting ([#27](https://github.com/igrady2/cant-bleep-this/issues/27)).

## The cron

- `wrangler.jsonc` sets `"triggers": { "crons": ["0 4 * * *"] }`, so it runs at 04:00 UTC every night.
- `main` is `custom-worker.ts`. It wraps the generated `.open-next/worker.js`: requests go to the OpenNext app, and `scheduled()` calls `handleRetentionCron` in `src/lib/retention/scheduled.ts`.
- The run uses the trigger's scheduled time, not the wall clock. Each run logs a summary of rows changed per step to Workers observability.
- To try it locally, run `npx wrangler dev --test-scheduled` after an OpenNext build, then open `/__scheduled?cron=0+4+*+*+*`.

## What is deleted

| Data | Deleted when |
| --- | --- |
| `messages` | `created_at` is more than 90 days ago |
| `reviews` | `created_at` is more than 90 days ago, or its message is being deleted. Seed-check reviews follow the same rule |
| `review_assignments` | `created_at` is more than 90 days ago, or its message is being deleted |
| `scores` | `day` is before the board's first day (the 90 UTC days including today, the same window `loadBoard` sums). Rows with 0 slips go too |
| `player_daily_posts`, `site_daily_posts`, `ip_daily_claims` | `day` is before the board's first day |
| `players` | The name is released (see below), with all of its rows |
| `test_cases` | Never. Cases are masked, anonymized and self-contained, with no foreign key to game rows |

## Releasing names

A name with no posts for 90 days is released, and anyone can claim it again.

- **Initial timestamp.** The claim sets `last_played_at` to the claim time (`created_at`). Only a post moves it. So a name that was claimed and never posted is released 90 days after the claim.
- Reviewing does not hold a name. Releasing a name deletes the player's reviews, assignments, messages, scores, daily post counts and review progress, so it leaves the board.
- Banned names (`banned_at` set) are never released, so a ban cannot be waited out.

## Keeping data consistent

- **Dependents before parents.** Reviews and assignments go before their messages, and every row that points at a player goes before the player. The message and player deletes skip any row that still has dependents, so nothing relies on `ON DELETE CASCADE`, and a run stopped partway leaves no orphans.
- **No dangling context.** Each message keeps the ids of the 10 messages before it. After deleting, the job removes ids that no longer exist from every kept message, and keeps the rest in order. Context loaders already skip missing ids. This also cleans up after maintainer deletions.
- **Board.** The board is computed from `scores` on each request, so nothing derived needs rebuilding. Points stay on the day the slip was confirmed, so a slip confirmed inside the window keeps its point after its message expires. A released player's scores are deleted with the player.
- **Censoring.** If a released player cast a deciding review on a slip that is still kept, the slip stays censored, using the deciding reviews that remain. With no deciding review left, the whole message is masked.

## Bounded batches

Every step is a looped `DELETE ... WHERE rowid IN (SELECT rowid ... LIMIT n)` (or `UPDATE` for context). Each statement touches at most 200 rows (`RETENTION_BATCH_SIZE`) and a run stops after 10,000 rows (`RETENTION_MAX_ROWS_PER_RUN`). That keeps one night well under D1's free 100,000 rows written a day. A backlog carries over to the next night, and rerunning is safe because each step matches only rows that are still expired.
