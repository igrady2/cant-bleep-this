# Seed messages

Policy version **v1**. Synthetic, masked fixtures for evaluating the contextual filter ([#35](https://github.com/igrady2/cant-bleep-this/issues/35)) and for known-answer reviewer checks ([#19](https://github.com/igrady2/cant-bleep-this/issues/19)). They implement [PRD milestone 1 — Rules](PRD.md#milestones-and-decisions).

## File and shape

- **Data:** [`fixtures/seeds.json`](../fixtures/seeds.json) — about 100 labeled examples.
- **Types and validation:** [`src/lib/seeds/`](../src/lib/seeds/) — `SeedFixture` matches what later loads into D1 `test_cases` (masked message text, JSON context, expected player verdict, rule, reasons, `source = seed`, `version_added = v1`), plus `author` and `roomUsernames` for Jev context ([#5](https://github.com/igrady2/cant-bleep-this/issues/5)).

Each fixture includes:

| Field | Purpose |
| --- | --- |
| `id` | Stable id (`seed-<rule>-<nn>` or `seed-fine-<nn>`) |
| `author` | Username posting the message under test |
| `text` | Masked message body (synthetic only) |
| `context` | Up to 10 preceding `{ username, text }` lines |
| `roomUsernames` | Usernames in the room for the check (includes `author`) |
| `expectedVerdict` | Player verdict: `fine` or `not_ok` |
| `rule` | Review rule id when `not_ok`; `null` when `fine` |
| `reasons` | One-line reviewer explanations when `not_ok` |

Rule ids match [`docs/CONTENT_RULES.md`](CONTENT_RULES.md) and [`src/lib/moderation/categories.ts`](../src/lib/moderation/categories.ts).

## Coverage

The set spans all nine reviewable rules, clean `fine` messages, disguised profanity, and contextual cases (for example the "pro Al" sexual innuendo vs a neutral reading). Contact details in fixtures use `[redacted]` or fictional stand-ins; validation rejects unmasked emails and long digit runs.

## Off-limits content

**Off-limits messages are not in this file.** Credible threats and sexual content involving minors are removed on sight and must never appear in the repo, feed, queue, or test fixtures ([#9](https://github.com/igrady2/cant-bleep-this/issues/9)). Filter routing for those cases is tested separately once the live off-limits question ships; seed data here only covers reviewable rules and fine messages.

## Usage

1. **CI / local:** `npm test` runs [`src/lib/seeds/seeds.test.ts`](../src/lib/seeds/seeds.test.ts), which validates the JSON (counts, ids, rule coverage, masking, verdict/rule consistency).
2. **Import in code:** `import { SEED_FIXTURES } from "@/lib/seeds"` after validation at module load.
3. **Filter baseline ([#35](https://github.com/igrady2/cant-bleep-this/issues/35)):** Run each fixture through the game moderation request with its `context` and `roomUsernames`; compare outcomes to labels without checking credentials into git.
4. **Queue seeds ([#19](https://github.com/igrady2/cant-bleep-this/issues/19)):** When inserting into D1, map to `test_cases` with masked text and anonymized stand-ins per the PRD; compare reviewer input to `expectedVerdict`, `rule`, and `reasons` for `seed_correct`.

Do not treat these labels as live Jev accuracy claims; they encode policy intent for humans and regression tooling.
