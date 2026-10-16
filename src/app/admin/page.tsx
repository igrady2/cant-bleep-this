import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";

import { ReleasesPanel } from "@/components/admin/releases-panel";
import { MetricsPanel } from "@/components/admin/metrics-panel";
import { ModerationPanel } from "@/components/admin/moderation-panel";
import { TriageBoard } from "@/components/admin/triage-board";
import { verifyAdminHeaders } from "@/lib/admin/access";

export const metadata: Metadata = {
  title: "Admin triage Â· Can't Bleep This",
  robots: { index: false, follow: false },
};

/** Verifies the Access JWT on every render; data loads only from the guarded API. */
async function AdminGate() {
  const result = await verifyAdminHeaders(await headers());
  if (!result.ok) {
    return <p role="alert" className="mt-8">Admin access denied. Sign in through Cloudflare Access.</p>;
  }
  return <><ModerationPanel /><TriageBoard /><MetricsPanel /><ReleasesPanel /></>;
}

export default function AdminPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">Admin triage</h1>
      <p className="mt-2 text-muted-foreground">
        Slips and false positives from the anonymized test set, grouped by rule. Tag the trick each one uses.
      </p>
      <Suspense fallback={<p role="status" className="mt-8">Checking accessâ€¦</p>}>
        <AdminGate />
      </Suspense>
    </main>
  );
}
