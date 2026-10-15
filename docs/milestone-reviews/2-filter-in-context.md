# Milestone 2 review: Filter in context

Milestone 2 turned the filter from a school-chat prototype into the game's filter. It renamed the project, swapped school categories for the game policy, removed the offline fallback so checks fail closed, and gave Jev room context and usernames. It then measured the result against the seed set. All five planned issues shipped in about 23 hours.

The key product decision came at the end. The first baseline scored 96 of 100, which was judged too easy to tell us much. Instead of filing four per-miss follow-ups, we opened one issue for a harder benchmark (#58) and kept filter tuning out of it.

All times are BOT (America/La_Paz, UTC-4). Anything the GitHub record doesn't show is marked **unknown**.

## 1. Planned vs shipped

GitHub milestone #2, "2 - Filter in context", was created Oct 14 at 3:05 PM and closed Oct 15 at 2:17 PM.

| Issue | Planned | Shipped via | Closed |
|---|---|---|---|
| #36 Rename school-chat-filter → Can't Bleep This | Worker/package rename, README and UI copy | PR #41 | Oct 14, 3:42 PM |
| #4 Replace school categories with game policy | Nine game questions, public-chat framing | PR #45 | Oct 14, 7:22 PM |
| #6 Remove offline fallback, fail closed | No mock; errors block the post and show a retryable error | PR #54 | Oct 15, 12:31 PM |
| #5 Pass room context and usernames to Jev | Up to 10 prior messages plus room usernames | PR #55 | Oct 15, 12:42 PM |
| #35 Evaluate filter against the seed set | Live seed evaluation and report; the permanent runner stays in #25 | PRs #56 and #57 (both "Refs #35" only); closed manually by igrady2 | Oct 15, 2:17 PM |

- **Result:** 5 of 5 planned issues shipped. None were dropped.
- **Deferred:** a harder seed benchmark, moved to #58 in M4 (Private beta). See section 2.
- **Scope changes after start:** unknown. GitHub keeps no history of milestone membership.
- **Board quirk:** after closing, the milestone API still reports `closed_issues: 4` and `open_issues: 1`, although all five issues are closed. Which item the counter thinks is open is unknown.

### Baseline from #35

| Setting | Value |
|---|---|
| Fixtures | 100 |
| Jev version | jev-1.13.0 |
| Thresholds | 0.5 |
| Score | **96 / 100** |

The four failures:

| Fixture | Failure |
|---|---|
| seed-personal_info-01 | Miss |
| seed-impersonation-06 | Contextual miss |
| seed-violence_threats-09 | Contextual false positive (expected fine) |
| seed-impersonation-04 | Wrong rule (flagged as bullying_harassment) |

## 2. Changes and why

Reasons come from PR and issue bodies. Where a deeper reason isn't written down, it's unknown.

- **PR #41 (closes #36): rebrand.** Renames school-chat-filter to Can't Bleep This across code and docs.
- **PR #45 (closes #4): school categories replaced by the game policy.** The filter now asks the nine game questions with public-chat framing instead of school categories.
- **PR #54 (closes #6): fail closed.** The offline mock is gone. If a check can't reach Jev, nothing is posted and the player gets a retryable error.
- **PR #55 (closes #5): context and usernames.** The moderate path now sends prior room messages and `roomUsernames` to Jev.
- **PRs #56 and #57 (refs #35): seed harness and live baseline.** Both reference #35 without closing it, so #35 was closed by hand once the baseline was in. PR #57 also hardened the harness (a `--live` gate, a pinned tsx version and redacted errors). A review of #57 rated cost-clearance timing as High before merge. How the owner resolved it is unknown.

### Decision: one harder benchmark, not four fixes

This is the main product call of the milestone.

- **The baseline was too easy.** 96% on v1 says the seed set doesn't stress the filter enough to guide decisions. In #58's words: "The v1 seed baseline scored 96%, so it is too easy to tell us much. This issue builds a harder benchmark. It does not tune the filter."
- **No per-miss follow-ups.** Filing one issue per failure would invite fixes for exactly those four messages. That is teaching to the test: the score goes up while real coverage stays the same. So the four failures were rolled into one issue, #58, instead of four. The #35 close note records this: "Four v1 failure cases rolled into #58 instead of separate per-miss issues (PM)."
- **What #58 does.** It starts from the four failures and expands them into adversarial variants. The v1 fixtures stay frozen so the 96% baseline remains comparable.
- **What #58 does not do.** Filter rule and threshold changes are explicitly out of scope until a harder set exists to measure them against.
- **Where it lives.** #58 is on M4 (Private beta), not M3.

### Follow-ups folded into #58

SEED_EVALUATION.md proposes ambiguity tickets for multi-rule blocks, off-limits false triggers, threshold edge cases and contextual sexual innuendo. Those fold into #58. They are covered by #58, not open filing work.

## 3. Impact check

Each open issue and PRD section touched by these changes is flagged **needs update** when the shipped decision likely differs from what it still says. Otherwise it's flagged **not**.

### Seed evaluation and benchmark (#35, #58)

| Item | Flag | Reason |
|---|---|---|
| #58 Harder seed benchmark v2 | Not | This issue is the follow-up itself. It owns the four failures and the deferred harder set. |
| #25 Permanent test-set runner | **Needs update** | #35 left the permanent runner to #25. Error rows may be stored with `outcome: "passed"` and `kind: "error"`. If that's confirmed, #25 needs to handle or fix it before it relies on the schema. Unverified. |
| SEED_EVALUATION.md proposed tickets | Not | Fold into #58. Covered by #58, not open filing work. |

### Fail closed and context (PRs #54, #55)

| Item | Flag | Reason |
|---|---|---|
| PRD: Starting point | Not | PRs #54 and #55 say they match the PRD. The exact PRD diff hasn't been checked (unknown). |
| PRD: Core loop | Not | Same as above: aligned per the PRs, unverified. |
| PRD: Success measures | Not | Same as above: aligned per the PRs, unverified. |

### Carried from M1

| Item | Flag | Reason |
|---|---|---|
| #15 Review assignments | **done / not needs update** | #15 needed no change. |
| #16 Judging UI | **done / not needs update** | #16 is already updated. |
| #20 Censor in feed | **done / not needs update** | #20 is already updated. |

## 4. Metrics

**Throughput**

- Issues closed: 5 (#36, #4, #6, #5, #35)
- PRs merged for M2 deliverables: 6 (#41, #45, #54, #55, #56, #57)
- Duration: about 23 hours 12 minutes, from milestone creation (Oct 14, 3:05 PM) to milestone close (Oct 15, 2:17 PM)

**Timeline**

- Oct 14, 3:05 PM: milestone created
- Oct 14, 3:42 PM: #36 closed
- Oct 14, 7:22 PM: #4 closed
- Oct 15, 12:31 PM: #6 closed
- Oct 15, 12:42 PM: #5 closed
- Oct 15, 2:17 PM: #35 closed, milestone closed

**Diff size**

| PR | Files | Lines |
|---|---|---|
| #41 | 8 | +21 / −29 |
| #45 | 6 | +189 / −94 |
| #54 | 16 | +138 / −160 |
| #55 | 8 | +292 / −7 |
| #56 | 10 | +628 / −4 |
| #57 | 10 | +11296 / −9984 |

PR #57's size is likely mostly lockfile churn. This hasn't been checked.

**Review and quality**

| PR | Formal GitHub approvals | Approval via comment |
|---|---|---|
| #41 | 0 | None recorded |
| #45 | 0 | None recorded |
| #54 | 0 | 1 |
| #55 | 0 | 1 |
| #56 | 0 | 1 |
| #57 | 0 | 1 |

- Formal GitHub approvals recorded: 0 across M2 deliverable PRs
- QA failures labeled as such: none recorded
- CI on the sampled M2 head commits: success. Earlier failed runs: unknown

As in M1, reviews happen through PR comments rather than formal GitHub reviews. #41 and #45 have no recorded approval of either kind.

## 5. Next: risks and adjustments

**Risks**

- **The 96% baseline is soft.** Until #58 lands in M4, there's no benchmark hard enough to show whether filter changes help. Any filter tuning before then is guesswork.
- **Error rows may look like passes.** If error rows store `outcome: "passed"` with `kind: "error"`, a failed check could count as a pass. Fix this before #25 depends on the schema.
- **The board doesn't match reality.** The M2 milestone counter still reports one open issue after closing.

**Adjustments**

- Build #10 and #13 next in M3. Keep #58 out of M3.
- Confirm the error-row behavior and update #25 to match.
- #15 needed no change. #16 and #20 are already updated.
- SEED_EVALUATION.md ambiguity tickets fold into #58.
- Fix the M2 milestone counter so the board shows 5 of 5 closed.
- Manual steps still open: #23 (Cloudflare Access) and #29 (preview deploy).
