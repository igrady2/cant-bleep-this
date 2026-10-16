"use client";

import { useEffect, useState } from "react";
import type { RateMetric, SuccessMetrics } from "@/lib/admin/metrics";

function Rate({ title, metric }: { title: string; metric: RateMetric }) {
  return <div className="rounded-lg border p-4">
    <h3 className="font-semibold">{title}</h3>
    <p className="mt-1 text-lg">{metric.value === null ? "No decided cases" : `${(metric.value * 100).toFixed(1)}%`} ({metric.numeratorCount}/{metric.denominatorCount})</p>
    <p className="mt-1 text-sm text-muted-foreground">{metric.numerator} / {metric.denominator}; {metric.window}.</p>
  </div>;
}

export function MetricsPanel() {
  const [days, setDays] = useState("28");
  const [metrics, setMetrics] = useState<SuccessMetrics | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/metrics?days=${days}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Metrics unavailable");
        const body = await response.json() as { metrics: SuccessMetrics };
        if (!controller.signal.aborted) setMetrics(body.metrics);
      }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [days]);

  return <section className="mt-10" aria-labelledby="metrics-heading">
    <h2 id="metrics-heading" className="font-heading text-2xl font-semibold">Beta success metrics</h2>
    <label className="mt-3 inline-block text-sm">Reporting window{" "}
      <select value={days} onChange={(event) => { setMetrics(null); setError(false); setDays(event.target.value); }} className="rounded border bg-background p-1">
        <option value="7">Last 7 days</option><option value="28">Last 28 days</option><option value="90">Last 90 days</option>
      </select>
    </label>
    {error ? <p role="alert" className="mt-4">Metrics are unavailable. Please reload to try again.</p>
      : metrics === null ? <p role="status" className="mt-4">Loading metrics…</p>
      : <div className="mt-4 space-y-4">
        <p className="text-sm text-muted-foreground">{metrics.verdicts.decided} decided, {metrics.verdicts.pending} pending of {metrics.verdicts.reviewable} reviewable posts; {metrics.verdicts.window}. Rates reflect recorded game verdicts for the filter versions used when posted.</p>
        <Rate title="Filter catch rate" metric={metrics.catchRate} />
        <Rate title="False-positive rate" metric={metrics.falsePositiveRate} />
        {(["twoVote", "threeReview"] as const).map((bucket) => <div key={bucket} className="space-y-2">
          <p className="text-sm font-medium">{metrics.verdicts.buckets[bucket].label}: {metrics.verdicts.buckets[bucket].decided}</p>
          <Rate title="Catch rate" metric={metrics.catchRate.byBucket[bucket]} />
          <Rate title="False-positive rate" metric={metrics.falsePositiveRate.byBucket[bucket]} />
        </div>)}
        <p className="text-sm">Other decided cases with fewer than two currently eligible reviews: {metrics.verdicts.buckets.other.decided}.</p>
        <Rate title="Three-review agreement (target: 70%)" metric={metrics.threeReviewAgreement} />
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold">Confirmed slips per ISO week</h3>
          <p className="text-sm text-muted-foreground">{metrics.confirmedSlipsPerWeek.numerator} / {metrics.confirmedSlipsPerWeek.denominator}; {metrics.confirmedSlipsPerWeek.window}.</p>
          <ul className="mt-2 text-sm">{metrics.confirmedSlipsPerWeek.weeks.map((week) => <li key={week.week}>{week.week}: {week.slips}{week.partial ? " (partial week)" : ""}</li>)}</ul>
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold">Confirmed-to-patched time</h3>
          <p>Median: {metrics.confirmedToPatched.medianSeconds === null ? "No timed patches" : `${(metrics.confirmedToPatched.medianSeconds / 86400).toFixed(1)} days`}. {metrics.confirmedToPatched.patched} patched; {metrics.confirmedToPatched.unpatched} unpatched; {metrics.confirmedToPatched.withinTarget} within 2 weeks.</p>
          <p className="text-sm text-muted-foreground">{metrics.confirmedToPatched.denominator}; {metrics.confirmedToPatched.window}.</p>
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold">Usage and free-plan fit</h3>
          <p className="text-sm">{metrics.usage.jevChecks.total} stored Jev checks ({metrics.usage.jevChecks.posts} posts + {metrics.usage.jevChecks.nameClaims} name claims); {metrics.usage.jevChecks.window}. {metrics.usage.jevChecks.denominator}.</p>
          <p className="text-sm">Estimated cost: ${metrics.usage.cost.estimatedUsd.toFixed(4)} at ${metrics.usage.cost.perCheckUsd} per check ({metrics.usage.cost.rateSource} rate); {metrics.usage.cost.denominator}, {metrics.usage.cost.window}.</p>
          <p className="text-sm">{metrics.usage.d1.posts.total} posts ({metrics.usage.d1.posts.perDay}/day); {metrics.usage.d1.reviews.total} reviews ({metrics.usage.d1.reviews.perDay}/day); {metrics.usage.window}.</p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">{metrics.usage.freePlan.notes.map((note) => <li key={note}>{note}</li>)}</ul>
        </div>
      </div>}
  </section>;
}
