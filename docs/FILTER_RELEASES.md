# Filter versions and the release gate

How a fix from the [slip loop](PRD.md#how-slips-improve-the-filter) becomes a new filter version. Recording releases and showing "Patched in v3" on the board is [#26](https://github.com/igrady2/cant-bleep-this/issues/26).

## What a version is

A filter version lives in [`src/lib/moderation/filter-versions.ts`](../src/lib/moderation/filter-versions.ts). It has a stable id (`v1`, `v2`, and so on) and holds everything that turns a message into an outcome apart from the Jev model:

| Part | What it is |
| --- | --- |
| `questions` | The nine rule questions and the off-limits question: instructions, criteria and optional `examples`. Examples are appended to the instructions sent to Jev; with none, the instructions are sent exactly as written. |
| `thresholds` | One inclusive threshold per rule, plus the off-limits threshold. |
| `normalization` | Optional steps applied to the message before scoring: `lowercase`, `collapse_spaced_letters` ("f u c k" to "fuck") and `fold_leetspeak` ("sh1t" to "shit"). Stored and displayed text is never normalized. |

`ACTIVE_FILTER_VERSION_ID` picks the version the posting path uses. Every new message is stamped with that id, and test cases captured from it keep it. Switching versions is a code change, so it goes through a pull request.

A released version never changes in place: its id already sits on messages it judged. The test in `filter-versions.test.ts` pins each released version's fingerprint, so editing one fails CI. Copy it into a new version instead.

`MODERATION_THRESHOLD` and `MODERATION_THRESHOLD_OFF_LIMITS` still override the active version's thresholds on the live path. They are an emergency knob only. A lasting threshold change belongs in a new version.

## Shipping a fix

1. Add the candidate to `FILTER_VERSIONS` with the next id. Leave `ACTIVE_FILTER_VERSION_ID` alone.
2. Export the game test cases from D1. The export holds masked message text, so keep it out of git (`.wrangler/` is ignored):

   ```bash
   npx wrangler d1 execute cant-bleep-this --remote --json \
     --command "SELECT id, message, context_snapshot, expected_verdict, rule FROM test_cases WHERE source = 'game' ORDER BY id" \
     > .wrangler/game-cases.json
   ```

   The query is `GAME_TEST_CASES_SQL` in [`src/lib/filter-release/cases.ts`](../src/lib/filter-release/cases.ts). Seed cases come from [`fixtures/seeds.json`](../fixtures/seeds.json).
3. Run the gate. This is a paid run, so it waits for Indigo's approval and a call count ([PROCESS.md](PROCESS.md#tests-and-paid-api-runs)):

   ```bash
   npm run evaluate:filter -- --live --candidate v2 --game-cases .wrangler/game-cases.json
   ```

4. Commit the report and open the pull request. If the gate passed, the same pull request points `ACTIVE_FILTER_VERSION_ID` at the candidate.

### Options

| Flag | Meaning |
| --- | --- |
| `--live` | Required. Without it the command refuses to call Jev. |
| `--candidate <id>` | Required. The version under test. |
| `--baseline <id>` | Defaults to the active version. |
| `--game-cases <file>` | A `wrangler d1 execute --json` export, or a plain array of rows. |
| `--seeds-only` | Gate on seeds alone. Use only before any game cases exist. |
| `--output <path>` | Defaults to `reports/filter-release-<baseline>-to-<candidate>.json`. |

The command also needs `TYPESAFE_API_KEY`, and it refuses to run while either threshold override is set, because the gate compares versions as written.

**Cost:** one Jev request per case for each version. When the two versions share questions and normalization and differ only in thresholds, one request per case serves both.

**Exit codes:** `0` gate passed, `1` usage or setup error, `2` Jev errors, `3` gate failed.

## The gate

Each case is classified the same way as the [seed baseline](SEED_EVALUATION.md#how-outcomes-are-classified). A slip captured without a deciding rule counts as caught by any block.

- **Catches:** `not_ok` cases blocked with the labeled rule among the flags.
- **False positives:** `fine` cases blocked or excluded as off-limits.

The candidate passes only if:

1. every case was judged by both versions (no errors),
2. catches are strictly higher than the baseline's, and
3. false positives are not higher than the baseline's.

A Jev failure is recorded as `kind: "error"` with `outcome: null`. It never counts as passed or caught.

## The report

The report holds case ids, labels and outcomes only, never message text. It records:

- **model:** the requested and resolved Jev model.
- **testSet:** seed and game case counts, plus a fingerprint of every case's text, context and label. Two reports with the same fingerprint used the same inputs.
- **baseline / candidate:** version id, configuration fingerprint, thresholds, normalization, summary counts, catches, false positives and per-rule results.
- **gate:** `passed` and the failing reasons.
- **remaining:** the candidate's missed slips, wrongly blocked fine cases and errors. These are the next version's work.
- **changes:** case ids newly caught, no longer caught, newly wrongly blocked and no longer wrongly blocked.
- **cases:** every case's result under both versions, sorted by id.

To reproduce a report, check out its commit, export the same cases (compare `testSet.fingerprint`) and run the same command with the same `TYPESAFE_MODEL`.
