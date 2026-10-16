"use client";

import { useEffect, useState, type ChangeEvent } from "react";

import type { FilterRelease } from "@/lib/filter-release/releases";

const DAY = 24 * 60 * 60;

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "unknown";
  if (seconds < DAY) return `${Math.max(1, Math.round(seconds / 3600))} h`;
  return `${(seconds / DAY).toFixed(1)} days`;
}

function ReleaseRow({ release }: { release: FilterRelease }) {
  const { patchTime } = release;
  return (
    <li className="rounded-lg border p-4" data-testid="release">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{release.version}</h3>
        <time className="text-sm text-muted-foreground" dateTime={new Date(release.releasedAt * 1000).toISOString()}>
          Released {new Date(release.releasedAt * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC
        </time>
      </div>
      <p className="mt-1 text-sm">
        Gated against {release.baselineVersion}: catches {release.baselineCatches} → {release.catches}, false
        positives {release.baselineFalsePositives} → {release.falsePositives}.
      </p>
      <p className="mt-1 text-sm">
        Patched {release.patchedSlips} {release.patchedSlips === 1 ? "slip" : "slips"}. Median patch
        time {formatDuration(patchTime.medianSeconds)}; {patchTime.withinTarget} of {patchTime.measured} timed
        within 2 weeks.
      </p>
    </li>
  );
}

/** Lists filter releases and records a new one from a gate-passing report (#26). */
export function ReleasesPanel() {
  const [releases, setReleases] = useState<FilterRelease[] | null>(null);
  const [error, setError] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/releases", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Releases unavailable");
        setReleases((await response.json() as { releases: FilterRelease[] }).releases);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, []);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch("/api/admin/releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: await file.text(),
      });
      const body = await response.json() as { release?: FilterRelease; error?: string };
      if (!response.ok || !body.release) {
        setStatus({ ok: false, text: body.error ?? "Couldn't record the release. Try again." });
      } else {
        const release = body.release;
        setReleases((current) => [release, ...(current ?? [])]);
        setStatus({ ok: true, text: `Recorded ${release.version}: ${release.patchedSlips} slips patched.` });
      }
    } catch {
      setStatus({ ok: false, text: "Couldn't record the release. Try again." });
    }
    setSaving(false);
  };

  return (
    <section className="mt-10" aria-labelledby="releases-heading">
      <h2 id="releases-heading" className="font-heading text-2xl font-semibold">Filter releases</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        After the active version deploys, upload its gate-passing report from <code>reports/</code>. Slips it
        catches show &quot;Patched in&quot; on the board; scores are not changed.
      </p>
      <label className="mt-3 inline-block text-sm">
        <span className="font-medium">Release report </span>
        <input type="file" accept="application/json,.json" disabled={saving} onChange={(event) => void upload(event)} />
      </label>
      {status && <p role={status.ok ? "status" : "alert"} className="mt-2 text-sm">{status.text}</p>}
      {error ? <p role="alert" className="mt-4">Releases are unavailable. Please reload to try again.</p>
        : releases === null ? <p className="mt-4 text-sm text-muted-foreground">Loading releases…</p>
        : releases.length === 0 ? <p className="mt-4 text-sm">No releases recorded yet.</p>
        : <ul className="mt-4 space-y-3">{releases.map((release) => <ReleaseRow key={release.version} release={release} />)}</ul>}
    </section>
  );
}
