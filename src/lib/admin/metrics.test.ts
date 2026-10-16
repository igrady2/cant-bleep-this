/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { env } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { MessagesDatabase } from "@/lib/messages/db";
import { FREE_PLAN_LIMITS, isoWeek, loadSuccessMetrics, parseWindowDays, readJevCostPerCheck } from "./metrics";

const { REVIEWS_TEST_DB: d1, CONSENSUS_SCHEMA: schema } = env as unknown as {
  REVIEWS_TEST_DB: {
    exec(sql: string): Promise<unknown>;
    prepare(sql: string): { bind(...values: unknown[]): { run(): Promise<unknown> } };
  }; CONSENSUS_SCHEMA: string;
};
const db = d1 as unknown as MessagesDatabase;
const DAY = 86400;
const now = Date.UTC(2026, 9, 15, 12) / 1000;
const exec = (sql: string) => d1.exec(sql.replace(/\s+/g, " "));
beforeAll(async () => { await exec(schema.replace(/--[^\n]*/g, "")); });
beforeEach(async () => {
  await exec("DELETE FROM patched_slips; DELETE FROM filter_releases; DELETE FROM test_cases WHERE source = 'game'; DELETE FROM reviews; DELETE FROM messages; DELETE FROM players;");
});
afterEach(() => vi.unstubAllEnvs());

async function players() {
  for (const id of ["author", "a", "b", "c", "d", "e", "excluded"]) {
    await d1.prepare("INSERT INTO players (id,name,normalized_name,token_hash,created_at,last_played_at,reviewer_standing) VALUES (?,?,?,'hash',?,?,?)")
      .bind(id, id, id, now - DAY, now, id === "excluded" ? "excluded" : "good").run();
  }
}
async function message(id: string, status: string, votes: string[], outcome = status === "caught" || status === "false_positive" ? "blocked" : "passed", time = now - DAY) {
  await d1.prepare("INSERT INTO messages (id,author_id,text,masked_text,context_message_ids,filter_scores,filter_version,filter_outcome,status,created_at) VALUES (?,'author',?,?,'[]','{}','v1',?,?,?)")
    .bind(id, outcome === "off_limits" ? null : "synthetic", outcome === "off_limits" ? null : "synthetic", outcome, status, time).run();
  for (let i = 0; i < votes.length; i++) await vote(id, ["a", "b", "c", "d"][i], votes[i], i);
}
async function vote(id: string, player: string, verdict: string | null, order: number, assignment = "queue") {
  await d1.prepare("INSERT INTO reviews (id,message_id,player_id,verdict,skipped,assignment,created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(`${id}-${player}`, id, player, verdict, verdict === null ? 1 : 0, assignment, now - DAY + order).run();
}
async function slip(id: string, status: string, confirmed: number | null, patchDays?: number) {
  await d1.prepare("INSERT INTO test_cases (id,message,context_snapshot,expected_verdict,reasons,source,version_added,source_message_id,filter_scores,filter_version,source_status,confirmed_at) VALUES (?,'synthetic','[]','not_ok','[]','game','v1',?,'{}','v1',?,?)")
    .bind(id, `msg-${id}`, status, confirmed).run();
  if (patchDays !== undefined) await d1.prepare("INSERT INTO patched_slips VALUES (?,'v2',?,?,?)")
    .bind(id, confirmed, confirmed! + patchDays * DAY, patchDays * DAY).run();
}

it("reports exact rates, separate vote buckets, weekly slips, patch timing and stored checks", async () => {
  await players();
  await message("caught2", "caught", ["not_ok", "not_ok"]);
  await message("slip2", "slip", ["not_ok", "not_ok"]);
  await message("caught3", "caught", ["not_ok", "not_ok", "not_ok"]);
  await message("clean3", "clean", ["fine", "not_ok", "fine"]);
  await message("fp2", "false_positive", ["fine", "fine"]);
  await message("pending", "pending", ["fine"]);
  await message("off", "excluded", [], "off_limits");
  await message("old", "caught", ["not_ok", "not_ok"], "blocked", now - 30 * DAY);
  await message("future", "caught", [], "blocked", now + 1);
  await exec(`INSERT INTO filter_releases VALUES ('v2', ${now}, 'v1','f','t',0,1,0,0);`);
  await slip("s1", "slip", now - 10 * DAY, 2);
  await slip("s2", "slip", now - 3 * DAY, 6);
  await slip("s3", "slip", now - DAY);
  await slip("old-slip", "slip", now - 30 * DAY);
  await slip("unknown", "slip", null);
  await slip("not-slip", "caught", now - DAY);
  vi.stubEnv("JEV_COST_PER_CHECK_USD", "0.001");
  const report = await loadSuccessMetrics(db, { now, days: 14 });
  expect(report.catchRate).toMatchObject({ value: 2 / 3, numeratorCount: 2, denominatorCount: 3 });
  expect(report.falsePositiveRate).toMatchObject({ value: 1 / 2, numeratorCount: 1, denominatorCount: 2 });
  expect(report.verdicts).toMatchObject({ reviewable: 6, pending: 1, decided: 5 });
  expect(report.verdicts.buckets.twoVote).toMatchObject({ decided: 3, caught: 1, slip: 1, falsePositive: 1 });
  expect(report.verdicts.buckets.threeReview).toMatchObject({ decided: 2, caught: 1, clean: 1 });
  expect(report.catchRate.byBucket.twoVote.value).toBe(0.5);
  expect(report.catchRate.byBucket.threeReview.value).toBe(1);
  expect(report.falsePositiveRate.byBucket.twoVote.value).toBe(1);
  expect(report.falsePositiveRate.byBucket.threeReview.value).toBe(0);
  expect(report.threeReviewAgreement).toMatchObject({ value: 0.5, numeratorCount: 1, denominatorCount: 2 });
  expect(report.confirmedSlipsPerWeek.weeks).toEqual([
    { week: "2026-W40", slips: 0, partial: true },
    { week: "2026-W41", slips: 1, partial: false },
    { week: "2026-W42", slips: 2, partial: true },
  ]);
  expect(report.confirmedToPatched).toMatchObject({ medianSeconds: 4 * DAY, patched: 2, unpatched: 1, withinTarget: 2 });
  for (const metric of [report.catchRate, report.falsePositiveRate, report.threeReviewAgreement,
    ...Object.values(report.catchRate.byBucket), ...Object.values(report.falsePositiveRate.byBucket)]) {
    expect(metric.denominator.length).toBeGreaterThan(0);
    expect(metric.window).toContain("last 14d");
  }
  for (const metric of [report.confirmedSlipsPerWeek, report.confirmedToPatched, report.usage.jevChecks, report.usage.cost]) {
    expect(metric.denominator).toBeTruthy(); expect(metric.window).toContain("last 14d");
  }
  expect(report.usage.jevChecks).toMatchObject({ total: 14, posts: 7, nameClaims: 7 });
  expect(report.usage.cost).toMatchObject({ perCheckUsd: 0.001, rateSource: "env", estimatedUsd: 0.014, projected30DayUsd: 0.03 });
  vi.stubEnv("JEV_COST_PER_CHECK_USD", "");
  expect((await loadSuccessMetrics(db, { now, days: 14 })).usage.cost).toMatchObject({ perCheckUsd: 0.0002, rateSource: "default", estimatedUsd: 0.0028 });
});

it("uses only the first three eligible votes, with one hand-picked and no self, excluded or skipped reviews", async () => {
  await players();
  await message("eligible", "slip", []);
  await vote("eligible", "author", "fine", 0);
  await vote("eligible", "excluded", "fine", 1);
  await vote("eligible", "e", null, 2);
  await vote("eligible", "a", "not_ok", 3, "hand_picked");
  await vote("eligible", "b", "fine", 4, "hand_picked");
  await vote("eligible", "c", "not_ok", 5);
  let report = await loadSuccessMetrics(db, { now });
  expect(report.verdicts.buckets.twoVote.slip).toBe(1);
  expect(report.threeReviewAgreement.value).toBeNull();
  await vote("eligible", "d", "not_ok", 6);
  report = await loadSuccessMetrics(db, { now });
  expect(report.threeReviewAgreement.value).toBe(1);
  // A fourth eligible vote cannot change agreement.
  await d1.prepare("UPDATE reviews SET skipped=0, verdict='fine', created_at=? WHERE id='eligible-e'").bind(now - DAY + 7).run();
  expect((await loadSuccessMetrics(db, { now })).threeReviewAgreement.value).toBe(1);
});

it("returns zeros and null rates for an empty window", async () => {
  const report = await loadSuccessMetrics(db, { now });
  expect(report.catchRate.value).toBeNull();
  expect(report.falsePositiveRate.value).toBeNull();
  expect(report.threeReviewAgreement.value).toBeNull();
  expect(report.confirmedToPatched).toMatchObject({ medianSeconds: null, patched: 0, unpatched: 0 });
  expect(report.confirmedSlipsPerWeek.total).toBe(0);
  expect(report.usage.jevChecks.total).toBe(0);
  expect(report.usage.cost.estimatedUsd).toBe(0);
  expect(JSON.stringify(report)).not.toMatch(/NaN|Infinity/);
});

it("measures D1 rows read for 10,000 posts under the daily free-plan limit", async () => {
  await players();
  await exec(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<10000)
    INSERT INTO messages (id,author_id,text,masked_text,context_message_ids,filter_scores,filter_version,filter_outcome,status,created_at)
    SELECT 'bulk-'||x,'author','synthetic','synthetic','[]','{}','v1','passed','clean',${now - DAY} FROM n;`);
  await exec(`INSERT INTO reviews (id,message_id,player_id,verdict,assignment,created_at)
    SELECT m.id||p.id,m.id,p.id,'fine','queue',${now - DAY} FROM messages m CROSS JOIN players p WHERE p.id IN ('a','b','c');`);
  const report = await loadSuccessMetrics(db, { now });
  expect(report.verdicts.buckets.threeReview.clean).toBe(10000);
  expect(report.usage.d1.reportRowsRead).not.toBeNull();
  expect(report.usage.d1.reportRowsRead!).toBeGreaterThan(0);
  expect(report.usage.d1.reportRowsRead!).toBeLessThan(FREE_PLAN_LIMITS.d1RowsReadPerDay);
  console.info(`10k-post metrics D1 rows_read: ${report.usage.d1.reportRowsRead}`);
}, 30000);

it("validates windows, ISO year boundaries and configurable cost rates", () => {
  expect(parseWindowDays(null)).toBe(28);
  expect(parseWindowDays("90")).toBe(90);
  for (const raw of ["0", "91", "1.5", "-1", "oops"]) expect(parseWindowDays(raw)).toBeNull();
  expect(isoWeek(Date.UTC(2021, 0, 1) / 1000)).toBe("2020-W53");
  for (const raw of ["bad", "-1", "Infinity", ""]) expect(readJevCostPerCheck({ JEV_COST_PER_CHECK_USD: raw }).source).toBe("default");
  expect(readJevCostPerCheck({ JEV_COST_PER_CHECK_USD: "0" })).toEqual({ perCheckUsd: 0, source: "env" });
});
