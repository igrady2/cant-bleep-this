# Seed fixture filter evaluation

Policy labels live in [`fixtures/seeds.json`](../fixtures/seeds.json) and [`docs/SEED_MESSAGES.md`](SEED_MESSAGES.md). This harness runs each fixture through the same contextual moderation path as the game (`moderate` with `context` and `roomUsernames`, one Jev request per check) and compares outcomes to those labels.

This milestone added the seed baseline script, report path, and mocked tests ([#35](https://github.com/igrady2/cant-bleep-this/issues/35)). The release gate over the whole permanent test set, seeds plus game cases, is [`npm run evaluate:filter`](FILTER_RELEASES.md) ([#25](https://github.com/igrady2/cant-bleep-this/issues/25)).

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

**Error:** the moderation call failed. The row has `kind: "error"`, `outcome: null` and a redacted `error` marker. It never counts as a pass.

**Contextual failure:** any `miss`, `false_positive`, or `wrong_rule` on a fixture with non-empty `context`.

**Catch vs wrong rule:** if the reviewer labeled rule R and the filter blocks with R among the flagged rules (even when other rules also fire), the case counts as a catch. Wrong rule applies only when R is absent from the flags.

## Policy ambiguities and follow-up issues

These four policy ambiguities are **covered by [#58](https://github.com/igrady2/cant-bleep-this/issues/58)** (harder seed benchmark v2 / adversarial variants). Do not file separate issues for them. #58 settles each with v2 fixtures (reviewed expected labels) and a written decision. Filter rules and thresholds are **out of scope** for #58 and must not be changed to resolve them.

1. **Seed eval: multi-rule blocks** — When Jev flags several rules, should the baseline require the top flag to match the seed label, or is “expected rule anywhere in flags” enough? Resolved in #58 via v2 fixtures and a documented decision.
2. **Seed eval: off-limits false triggers on reviewable-only seeds** — Seeds exclude off-limits content. Define how to count and document `off_limits_unexpected` on otherwise clean fixtures; the convention is fixed in #58 through fixtures and written decision (not by changing the off-limits question or threshold).
3. **Seed eval: threshold edge cases (0.5 inclusive)** — Several fixtures sit near the default 0.5 threshold. #58 decides whether labels should include expected score bands or the harness should report near-miss scores without failing the run, using v2 fixtures only (no threshold tuning).
4. **Seed eval: contextual sexual-innuendo pairs** — Fixtures where readings depend on preceding chat (`seed-sexual_content-*` and related fine controls in `fixtures/seeds.json`). Settled in #58 only: v2 fixtures, reviewed labels, and a written decision. No filter rule or threshold changes are in scope.

After a cleared live run, replace the “live run pending” note in the PR with the committed `reports/seed-baseline.json`. Track failing fixture ids and related policy gaps in [#58](https://github.com/igrady2/cant-bleep-this/issues/58), not as separate issues.

## Live run status

**Baseline checked in** on PR [#57](https://github.com/igrady2/cant-bleep-this/pull/57) (`reports/seed-baseline.json`, `jev-1.13.0`, thresholds 0.5). Re-run with `npm run evaluate:seeds -- --live` after policy or model changes.
