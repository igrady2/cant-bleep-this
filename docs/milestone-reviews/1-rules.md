# Milestone 1 review: Rules

Milestone 1 set the content rules, the seed messages, username validation and off-limits exclusion that the rest of the game builds on. All four planned issues shipped in about 21 hours. Along the way, three product decisions changed the PRD and created follow-up work for later milestones.

All times are BOT (America/La_Paz, UTC-4). Anything the GitHub record doesn't show is marked **unknown**.

## 1. Planned vs shipped

The M1 issues were created Oct 14 between 2:46 and 2:47 PM, and the milestone itself was created at 3:05 PM.

| Issue | Planned | Shipped via | Closed |
|---|---|---|---|
| #2 | Rules and Jev wording | PR #43 | Oct 14, 4:06 PM |
| #3 | About 100 seed messages | PR #52 | Oct 15, 11:45 AM |
| #8 | Username validation | PR #51 | Oct 15, 11:50 AM |
| #12 | Off-limits exclusion | PR #50 | Oct 15, 11:53 AM |

- **Result:** 4 of 4 planned issues shipped. None were dropped or deferred.
- **Scope changes after start:** unknown. GitHub keeps no history of milestone membership.
- **Not part of M1:** #1 is the PRD PR (merged Oct 14, 2:38 PM, before the milestone existed) and isn't on the M1 milestone.

## 2. Changes and why

These PRs changed the PRD or delivered M1 scope. Reasons come from PR bodies. Where a deeper reason isn't written down, it's unknown.

- **PR #37: PRD records decisions from issue review.** Open decisions the issues depended on were written into the PRD: off-limits as a 10th Jev question at 0.5 (#12); reviewer standing after missing 3 of last 10 seeds (#19); skip meets the review requirement but is not one of a message's 3 reviews (#16, #17); admin behind Cloudflare Access (#23); neutral stand-in names in test cases (#22); and v1 censoring as whole-message "█████" (later replaced by #48).
- **PR #39: The review queue mixes uncertain and random picks.** Apart from ~1 in 10 seed checks, the queue had been random. Non-seed picks are now about half the messages the filter was least sure of and half random, so confident mistakes still surface. The split is a setting (50/50 to start). Issues #15 and #7 were updated to match.
- **PR #43 (closes #2): CONTENT_RULES.md and general-audience policy.** Adds nine Jev questions with stable IDs, 0.5 thresholds, boundary examples, plus a separate off_limits question; removes school framing and academic dishonesty.
- **PR #48: Slips are censored by masking the vowels in flagged words.** Replaces whole-message "█████" (Indigo decided 2026-10-15) so slips stay readable ("f\*ck"). Word marking moves into Build v1. Docs only; follow-ups are #20, presentation code still using █████, and a schema migration.
- **PR #53: Clarifies v1 word tapping and vowel masking.** Records edge cases from the #48 review (union of deciding spans; whole-message mask only if neither marked; y is not a vowel; no-vowel middle-character mask). With #48, produced #49 (M3, closed Oct 15 11:44 AM BOT). Docs only; closes neither #49 nor #20.
- **PR #44 and the crisis note:** The 988 Suicide & Crisis Lifeline rule came out of #2. The crisis-note issue was added Oct 14 at 4:07 PM BOT, one minute after #2 closed.
- **PR #50 (closes #12), #51 (closes #8), #52 (closes #3):** shipped the remaining M1 deliverables (off-limits plumbing, username policy helper, ~100 seed messages). Note: issue bodies for #8 and #12 still say "Milestone: 3 — Build v1" in their text, while GitHub lists them under Milestone 1 (Rules).

## 3. Impact check

Each open issue and PRD section touched by these changes is flagged **needs update** when the shipped decision likely differs from what it still says. Otherwise it's flagged **not**.

### Masking and word tapping (PRs #48, #53)

| Item | Flag | Reason |
|---|---|---|
| #16 Judging UI | **Needs update** | Optional word tapping on a Not OK review now ships in Build v1, so the judging UI must capture spans. |
| #20 Censor in feed | **Needs update** | PR #48 names it as a follow-up. Feed censoring changes from whole-message "█████" to vowel masking of flagged spans. |
| #22 Anonymized test cases | Not | It covers PII masking with the shared helper (#11), which vowel masking doesn't change. |
| PRD: Censoring and false positives | Not | PR #48 already rewrote it. |
| PRD: Censoring edge cases | Not | PRs #48 and #53 already added the vowel, no-vowel and span rules. |
| PRD: Core loop step 4 | Not | It already describes optional tapping and says tapping ships in Build v1. |
| PRD: Milestone 3 Build v1 | Not | It already lists word tapping and vowel masking. |

### Review queue mix (PR #39)

| Item | Flag | Reason |
|---|---|---|
| #15 Review assignments | **Needs update** | It predates PR #39. Queue building now needs the uncertain/random split, with the split as a setting. |
| #19 Seed checks and standing | Not | The 1-in-10 seed rate and the 3-of-last-10 standing rule didn't change. Only the non-seed mix did. |
| PRD: Core loop "Known answers" | Not | PR #39 already updated it. |

### Crisis line (PR #44)

| Item | Flag | Reason |
|---|---|---|
| #44 Crisis note | Not | This issue is the follow-up itself. |
| PRD: Our content rules (Self-harm) | Not | The Self-harm row already includes the 988 note. |
| PRD: Milestone 4 Private beta | Not | It already requires the 988 note before the public launch. |

## 4. Metrics

**Throughput**

- Issues closed: 4 (#2, #3, #8, #12)
- PRs merged for M1 deliverables: 4 (#43, #50, #51, #52)
- Duration: about 21 hours, from issue creation (Oct 14, 2:46 PM) to the last close (#12, Oct 15, 11:53 AM)

**Timeline**

- Oct 14, 3:59 PM: first PR (#43) opened
- Oct 14, 4:06 PM: #2 closed
- Oct 15, 11:45 AM: #3 closed
- Oct 15, 11:50 AM: #8 closed
- Oct 15, 11:53 AM: #12 closed

**Diff size**

| PR | Files | Lines |
|---|---|---|
| #43 | 2 | +157 / −4 |
| #50 | 26 | +921 / −64 |
| #51 | 5 | +392 |
| #52 | 6 | +2172 |

**Review and quality**

| PR | Formal GitHub reviews | Conversation / Codex review comments | Final CI |
|---|---|---|---|
| #43 | 0 | 0 | None (it predates CI, which arrived in PR #46) |
| #50 | None recorded | 2 (Codex: request changes, then approve) | SUCCESS |
| #51 | None recorded | 2 (Codex: request changes, then approve) | SUCCESS |
| #52 | None recorded | 2 (Codex: request changes, then approve) | SUCCESS |

- Review rounds on #50–#52: 2 each (request changes → approve), via Codex PR comments rather than formal GitHub review objects
- Formal GitHub review objects recorded: 0 across M1 deliverable PRs
- QA failures labeled as such: none recorded
- Earlier failed CI runs: unknown

The process gap is missing formal GitHub reviews on the board, even though #50–#52 did get a different-model review pass through Codex comments.

## 5. Next: risks and adjustments

**Risks**

- **#35 could hold M2 open.** M2 ("2 – Filter in context") is done when #35 closes, and #35 is the last open issue there. Its harness PRs (#56, #57) have already merged, but the issue may still be open. Check its acceptance criteria before calling M2 done.
- **The seed set may be too easy.** #58 (adversarial seed benchmark v2, opened Oct 15) suggests the ~100 seed messages from #3 may not stress the filter enough.
- **The board doesn't match reality.** The M1 milestone still shows as open even though it has 0 open issues.

**Adjustments**

- Close the M1 milestone on GitHub.
- Update #15, #16 and #20 to match PRs #39, #48 and #53 before work on them starts.
- Confirm #35's acceptance criteria against #56 and #57, then close it or list what's missing.
- Note: #9 is in M3 and is already closed, so it doesn't affect the M2 gate.
