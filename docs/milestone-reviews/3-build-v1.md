# Milestone 3 review: Build v1

Milestone 3 built the playable game on top of the M1 rules and the M2 filter: name claims, the shared room, posting with daily caps, peer review and consensus, censoring, the leaderboard, the permanent test set and release gate, admin triage and moderation, nightly retention, and the beta metrics report. 21 of 23 issues shipped as merged code in about 32 hours. One issue was closed as superseded, and one (#29, the live preview smoke test) is still open because it needs Indigo's Cloudflare account and a paid Jev call budget.

**M4 (Private beta) does not start until Indigo signs off on the checklist at the end of this review.**

All times are BOT (America/La_Paz, UTC-4). Anything the GitHub record doesn't show is marked **unknown**.

## 1. Planned vs shipped

GitHub milestone #3, "3 - Build v1", was created Oct 14 at 3:05 PM. The last code merge was PR #88 on Oct 15 at 11:20 PM. The milestone holds 23 issues plus PR #74.

| Issue | Planned | Shipped via | Closed |
|---|---|---|---|
| #7 | D1 schema, indexes, local DB setup | PR #40 | Oct 14, 3:57 PM |
| #11 | Mask personal info in every presentation | PR #42 | Oct 14, 4:08 PM |
| #9 | Turnstile name claims and device tokens | PR #59 | Oct 15, 1:53 PM |
| #10 | Landing page, age gate, name recovery | PR #64 | Oct 15, 2:47 PM |
| #13 | Persist posts, daily posting limits | PR #65 | Oct 15, 2:48 PM |
| #14 | Shared room feed and posting UI | PR #68 | Oct 15, 3:22 PM |
| #44 | 988 crisis line note for self-harm | PR #67 | Oct 15, 3:35 PM |
| #15 | Review assignments, hand-picked eligibility | PRs #70, #72, #71 (stacked) | Oct 15, 4:02 PM |
| #16 | Judging UI, validated review submission | PR #74 | Oct 15, 4:56 PM |
| #17 | Consensus verdicts, slip points exactly once | PR #76 | Oct 15, 6:51 PM |
| #18 | Adaptive posts-between-reviews requirement | PR #77 | Oct 15, 7:06 PM |
| #20 | Censor confirmed slips in the feed | PR #79 | Oct 15, 7:23 PM |
| #19 | Seed checks in queue, reviewer standing | PR #78 | Oct 15, 7:41 PM |
| #21 | 90-day top-50 slips leaderboard | PR #80 | Oct 15, 8:04 PM |
| #22 | Anonymized permanent test cases | PR #81 | Oct 15, 8:15 PM |
| #25 | Versioned test-set runner and release gate | PR #82 | Oct 15, 8:57 PM |
| #23 | Admin triage behind Cloudflare Access | PR #84 | Oct 15, 9:18 PM |
| #27 | Nightly retention, inactive-name release | PR #83 | Oct 15, 9:22 PM |
| #26 | Filter releases, patched slip versions | PR #85 | Oct 15, 9:51 PM |
| #28 | Beta success-metric report | PR #86 | Oct 15, 10:23 PM |
| #24 | Admin message deletion and username bans | PR #87 | Oct 15, 10:39 PM |
| #49 | Vowel-mask censoring and word flagging | Superseded by #16 (PR #74) and #20 (PR #79) | Oct 15, 2:24 PM, not planned |
| #29 | Document and verify the v1 preview deploy | PR #88 (docs + `env.preview`), "Refs #29" only | **Open** |

- **Result:** 21 of 23 issues shipped as merged code. #49's work did ship, through #16 and #20, so nothing planned was dropped.
- **Still open:** #29. The guide and the `env.preview` Wrangler block are merged, and the preview D1 database has all 14 migrations applied (reported by the Setup Guide agent; not visible in GitHub). Secrets, the deploy and the live smoke checklist remain. See section 5.
- **Shipped alongside, not on the milestone:** PR #73 (exact dependency pins, Indigo's standing rule) and PR #75 (shorter agent guidance plus CLAUDE.md).
- **Scope changes after start:** unknown. GitHub keeps no history of milestone membership.
- **Counter check:** the milestone reports 23 closed and 1 open, which matches (22 issues plus PR #74 closed, #29 open). The M2 counter quirk did not repeat.

## 2. Changes and why

Reasons come from PR and issue bodies and from the review comments on each PR.

- **Players and posting (#9, #10, #13, #14, #44).** Name claims need Turnstile, cap at three per IP per UTC day, and store only token hashes and salted IP hashes. Posting is authenticated, 140 characters, capped per day, and fails closed when Jev can't be reached. The 988 note shows when the self_harm question fires (#44 settled the M1 gap on this).
- **Peer review (#15, #16, #17, #18, #19).** #15 was too large for one PR, so it shipped as a three-part stack (#70 schema, #72 eligibility and rate limits, #71 queue and judge APIs). Reviewers tap words to flag spans; two matching reviews decide; points are awarded atomically, exactly once. The posts-between-reviews requirement tightens as the queue grows, and about 1 in 10 queue picks is a seed check that tracks reviewer standing.
- **Censoring (#20, closing out #49).** A confirmed slip masks vowels only in the union of the deciding reviewers' spans, matching PRs #48 and #53. This is the delivery the M1 review said was missing: `presentText` no longer returns `█████` for slips.
- **Board and test set (#21, #22, #25, #26).** The board counts slips over 90 UTC days, top 50. Each verdict saves an anonymized permanent test case with Player A/B stand-ins. The release gate refuses a filter release unless the test set passes, and only an admin can create one. Patched slips show the release that caught them without removing earned points.
- **Admin (#23, #24, #28).** `/admin` and `/api/admin/*` sit behind Cloudflare Access, and the Worker verifies the Access JWT itself (RS256 only, fails closed). Delete removes a message, its point and its test case; ban hides the name from the board. The metrics report runs only on demand by an admin, because each run costs about 9% of the free daily D1 read limit per 10,000 posts.
- **Retention (#27).** A 04:00 UTC cron deletes expired game rows, releases inactive unbanned names, keeps banned names and permanent test cases, and is safe to rerun. It runs through `custom-worker.ts`, so deploying the plain OpenNext worker would lose it.
- **Preview (#29, PR #88).** Adds `docs/PREVIEW.md` and a separate `env.preview` (own Worker name, own D1, own rate-limit namespaces 4321-4324, same cron). Production is untouched.

## 3. Impact check

Each open issue and document touched by these changes is flagged **needs update** when what shipped likely differs from what it still says. Otherwise it's flagged **not**.

| Item | Flag | Reason |
|---|---|---|
| #29 Preview deploy | **Open work** | Needs secrets, Turnstile, Access, deploy and the live smoke run. Code-side checks pass (section 4). |
| #30 Private-beta checklist | Not | Waits on a working preview. Nothing shipped contradicts it. |
| #31 Beta results report | Not | Can use the #28 metrics report as its data source. |
| #32 cantbleepthis.com for the game Worker | **Needs update** | Production `database_id` in `wrangler.jsonc` is still the all-zero placeholder, and production needs its own Turnstile, Access app and secrets. #32 should list these explicitly. |
| #33 Link from indigogrady.com | Not | Waits on #32. |
| #34 Weekly filter review and release cycle | Not | Can now point at the #25 release gate and #26 release records. |
| #58 Harder seed benchmark | Not | Stays in M4, as the M2 review decided. |
| PR #66 (draft) GitHub Actions LLM review | **Needs a decision** | Opened before M3 and still a draft. Close it or bring it into M4; it should not sit open. |
| docs/PROCESS.md | **Fixed in this PR** | It referred to Indigo as "she"; Indigo uses he/him. |

## 4. Metrics

**Throughput**

- Issues closed: 22 (21 completed, 1 superseded)
- PRs merged for M3 deliverables: 24 (#40, #42, #59, #64, #65, #67, #68, #70, #71, #72, #74, and #76 through #88), plus #73 and #75 alongside
- Duration: about 32 hours from milestone creation (Oct 14, 3:05 PM) to the last code merge (Oct 15, 11:20 PM). Most of it landed in the 10 hours after 1:53 PM on Oct 15.
- Code size: about 15,600 lines added and 560 removed across the M3 PRs, not counting lockfiles and fixtures. That figure includes tests.

**Checks on main at `3dfacbc`**, rerun for this review on Oct 16:

| Check | Result |
|---|---|
| lint, typegen, typecheck | Pass |
| Tests | 72 files, 512 tests, all pass (mocks only, no live Jev) |
| `opennextjs-cloudflare build --env preview` | Pass |
| `wrangler deploy --env preview --dry-run` | Pass. Binds DB to `cant-bleep-this-preview`, the four rate limiters, and ASSETS. Bundle 11.1 MB raw, 2.6 MB gzip. |

**Review and quality**

| | Count |
|---|---|
| M3 deliverable PRs with a recorded review comment | 23 of 24 (#40's review names no models) |
| PRs with no recorded review | #42 (personal-info masking, M3) and #73 (dependency pins, alongside) |
| Formal GitHub approvals | 0 |
| Reviews that requested changes before passing | at least #65 and #71 |
| PR bodies with "Built by LLM" filled in | about half; the Claude Code and mixed PRs say "Unknown" |

Reviews were posted as comments because every agent acts as the repo owner's account, and GitHub won't let an owner approve their own PR. The review comments name the builder and reviewer models. Grok reviewed the Cursor, Codex and Claude Code builds, and Codex (GPT-6) reviewed #88 because its last commits were Grok's.

## 5. Next: risks and adjustments

**Risks**

- **Nothing has run live yet.** Every check above uses mocks or a dry run. Turnstile, Access, Jev from the deployed Worker, and cron delivery are untested until the #29 smoke run.
- **Bundle headroom is thin.** 2.6 MB gzip against the Workers free plan's 3 MB limit. A new heavy dependency could block deploys.
- **workers.dev and Access.** If Access is turned on for the workers.dev hostname, it covers the whole site, so beta testers would need to be on the allow policy. A custom preview hostname with path-based Access avoids this.
- **The process record is thin.** "Built by LLM: Unknown" on many PRs and no formal approvals make the builder/reviewer split harder to audit later.
- **Test tooling deprecation.** `@cloudflare/vitest-pool-workers` warns it has been renamed to `@cloudflare/vitest-plugin`. Not urgent.

**Adjustments**

- Finish #29 before M4: set the preview secrets, deploy, run the smoke checklist with an approved Jev call budget, record the results in `docs/PREVIEW.md`, and close #29.
- Update #32 with the production placeholder ID, Turnstile, Access and secrets steps.
- Decide on draft PR #66.
- Builders fill in "Built by LLM" with the concrete model, or "Unknown" with the tool's session link.

## Approval checklist

Indigo, check each box to approve M3 and start M4.

- [ ] Section 1 matches what I expected Build v1 to deliver.
- [ ] #49 is correctly closed as superseded by #16 and #20.
- [ ] The #29 preview smoke test has passed and #29 is closed, or I accept starting M4 with it still open.
- [ ] #32 gets the production setup steps from section 3.
- [ ] I've decided what to do with draft PR #66.
- [ ] M4 (Private beta) can start.
