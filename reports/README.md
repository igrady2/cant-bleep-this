# Filter baseline reports

## Path

| File | Description |
| --- | --- |
| `seed-baseline.json` | Latest **live** seed evaluation output from `npm run evaluate:seeds -- --live`. |
| `seed-baseline.example.json` | Shape-only example with zero counts for tooling and docs. |

## Generating a baseline

1. Set `TYPESAFE_API_KEY` (and optional `TYPESAFE_MODEL`, `MODERATION_THRESHOLD`, `MODERATION_THRESHOLD_OFF_LIMITS`).
2. Run `npm run evaluate:seeds -- --live`.
3. Commit `seed-baseline.json` when the team wants a frozen comparison point for a given model and threshold set.

Do **not** commit API keys or unmasked personal information. Reports list fixture ids and outcomes only.

## Report fields (`reportVersion: 1`)

- **configuration** — Thresholds and TypeSafe model identity.
- **summary** — Aggregate pass / catch / miss / false positive / wrong rule / contextual failure / error counts.
- **byRule** — Per reviewable rule: `expectedViolations`, `catches`, `misses`, `falsePositiveFlags`.
- **failures** — Subset of cases that did not pass or catch, for quick diffing.
- **cases** — Per-fixture classification (ids and rules only).

See [`docs/SEED_EVALUATION.md`](../docs/SEED_EVALUATION.md) for classification rules.
