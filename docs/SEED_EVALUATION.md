# Seed fixture filter evaluation

Policy labels live in [`fixtures/seeds.json`](../fixtures/seeds.json) and [`docs/SEED_MESSAGES.md`](SEED_MESSAGES.md). This harness runs each fixture through the same contextual moderation path as the game (`moderate` with `context` and `roomUsernames`, one Jev request per check) and compares outcomes to those labels.

The permanent D1 test-set runner and release gate are tracked in [#25](https://github.com/igrady2/cant-bleep-this/issues/25); this milestone only adds the seed baseline script, report path, and mocked tests ([#35](https://github.com/igrady2/cant-bleep-this/issues/35)).

## Commands

| Command | Purpose |
| --- | --- |
| `npm test` | Validates fixtures and runs the evaluation harness with **mocked Jev** (no API cost). |
| `npm run evaluate:seeds -- --live` | **Live** baseline: one billed Jev call per seed fixture (~100 today). Requires explicit `--live` and `TYPESAFE_API_KEY`. Without `--live`, the CLI refuses to call Jev. Do not run in CI or cloud agents without explicit cost clearance. |

Optional flags for the live runner:

```bash
npm run evaluate:seeds -- --live --output reports/seed-baseline.json
```

## Report output

Live runs write JSON to [`reports/seed-baseline.json`](../reports/seed-baseline.json) by default. See [`reports/README.md`](../reports/README.md) for fields. Reports include:

- Model and threshold configuration (requested model id, resolved model from Jev, reviewable and off-limits thresholds).
- Summary counts: passes, catches, misses, false positives, wrong-rule blocks, unexpected off-limits, contextual failures, and errors.
- Per-rule aggregates: expected violations, catches, misses, and false-positive flag counts.
- Failure lists keyed by **fixture id only** (no message bodies or credentials).
- Per-case `error` fields use redacted markers only (for example `jev_rate_limited`), never raw provider response text.

Re-run the same command after policy or model changes and diff the JSON to track regressions.

## How outcomes are classified

| Label | Expected | Filter | Kind |
| --- | --- | --- | --- |
| Clean | `fine` | passed | `pass` |
| False positive | `fine` | blocked | `false_positive` |
| Off-limits surprise | `fine` | off_limits | `off_limits_unexpected` |
| Caught | `not_ok` | blocked, expected rule among flags | `catch` |
| Miss | `not_ok` | passed | `miss` |
| Wrong rule | `not_ok` | blocked, expected rule not among flags | `wrong_rule` |
| Off-limits on labeled violation | `not_ok` | off_limits | `off_limits_unexpected` |

**Contextual failure:** any `miss`, `false_positive`, or `wrong_rule` on a fixture with non-empty `context`.

**Catch vs wrong rule:** if the reviewer labeled rule R and the filter blocks with R among the flagged rules (even when other rules also fire), the case counts as a catch. Wrong rule applies only when R is absent from the flags.

## Policy ambiguities and follow-up issues

Open focused issues before treating the seed baseline as a release gate. Proposed tickets (titles only; file when live results highlight specific ids):

1. **Seed eval: multi-rule blocks** — When Jev flags several rules, should the baseline require the top flag to match the seed label, or is “expected rule anywhere in flags” enough for milestone 1?
2. **Seed eval: off-limits false triggers on reviewable-only seeds** — Seeds exclude off-limits content; document how to count `off_limits_unexpected` on otherwise clean fixtures and whether to tune the off-limits question or threshold first.
3. **Seed eval: threshold edge cases (0.5 inclusive)** — Several fixtures sit near the default 0.5 threshold; decide whether labels should include expected score bands or the harness should report near-miss scores without failing the run.
4. **Seed eval: contextual sexual-innuendo pairs** — Review fixtures where `Player E is pro Player B` readings depend on preceding chat; turn systematic live misses into rule-question or example updates (see `seed-sexual_content-*` and related fine controls in `fixtures/seeds.json`).

After a cleared live run, replace the “live run pending” note in the PR with the committed `reports/seed-baseline.json` and link any new issues for failing fixture ids.

## Live run status

**Baseline checked in** on PR [#57](https://github.com/igrady2/cant-bleep-this/pull/57) (`reports/seed-baseline.json`, `jev-1.13.0`, thresholds 0.5). Re-run with `npm run evaluate:seeds -- --live` after policy or model changes.
