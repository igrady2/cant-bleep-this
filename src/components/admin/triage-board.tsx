"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TRIAGE_TAGS,
  type TriageItem,
  type TriageKind,
  type TriageTag,
  type TriageView,
} from "@/lib/admin/triage-types";

const KIND_LABELS: Record<TriageKind, string> = { slip: "Slips", false_positive: "False positives" };
const KIND_HINTS: Record<TriageKind, string> = {
  slip: "Passed the filter; players confirmed Not OK. Grouped by the reviewers' rule.",
  false_positive: "Blocked by the filter; players confirmed Fine. Grouped by the rule the filter scored highest.",
};
const TAG_HINTS: Record<TriageTag, string> = {
  spelling: "leetspeak, spacing, symbols",
  sound: "homophones",
  meaning: "innuendo, euphemism, new slang",
  context: "only bad given who is in the room",
};

type TagFilter = "all" | "untagged" | TriageTag;

function matchesFilter(item: TriageItem, filter: TagFilter): boolean {
  if (filter === "all") return true;
  if (filter === "untagged") return item.tags.length === 0;
  return item.tags.includes(filter);
}

function TriageCard({ item, onTags }: { item: TriageItem; onTags: (id: string, tags: TriageTag[]) => Promise<boolean> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const toggle = async (tag: TriageTag) => {
    const next = item.tags.includes(tag) ? item.tags.filter((t) => t !== tag) : [...item.tags, tag];
    setSaving(true);
    setError(false);
    const ok = await onTags(item.id, TRIAGE_TAGS.filter((t) => next.includes(t)));
    setSaving(false);
    setError(!ok);
  };
  return (
    <li className="rounded-lg border p-4" data-testid="triage-item">
      {item.context.length > 0 && (
        <ol className="mb-2 space-y-1 text-sm text-muted-foreground" aria-label="Chat before the message">
          {item.context.map((entry, index) => (
            <li key={index}><span className="font-medium">{entry.username}:</span> {entry.text}</li>
          ))}
        </ol>
      )}
      <p className="text-base font-medium break-words">{item.message}</p>
      {item.patchedIn && <Badge variant="secondary" className="mt-2">Patched in {item.patchedIn}</Badge>}
      {item.reasons.length > 0 && (
        <div className="mt-3">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground">Reviewer reasons</h4>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {item.reasons.map((reason, index) => <li key={index}>{reason}</li>)}
          </ul>
        </div>
      )}
      <div className="mt-3">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground">Filter scores</h4>
        <ul className="mt-1 flex flex-wrap gap-1.5 text-xs" aria-label="Filter scores">
          {item.scores.map((score) => (
            <li key={score.rule}>
              <Badge variant="outline">
                {score.label} {score.score.toFixed(2)}
              </Badge>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Filter version {item.filterVersion ?? "unknown"} · added to the test set in {item.versionAdded}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Trick tags">
        {TRIAGE_TAGS.map((tag) => (
          <Button
            key={tag}
            size="xs"
            variant={item.tags.includes(tag) ? "default" : "outline"}
            aria-pressed={item.tags.includes(tag)}
            title={TAG_HINTS[tag]}
            disabled={saving}
            onClick={() => void toggle(tag)}
          >
            {tag}
          </Button>
        ))}
        {error && <span role="alert" className="text-xs text-destructive">Couldn&apos;t save tags. Try again.</span>}
      </div>
    </li>
  );
}

export function TriageBoard() {
  const [kind, setKind] = useState<TriageKind>("slip");
  const [filter, setFilter] = useState<TagFilter>("all");
  const [view, setView] = useState<TriageView | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/triage?kind=${kind}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Triage unavailable");
        setView(await response.json() as TriageView);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [kind]);

  const selectKind = (next: TriageKind) => {
    if (next === kind) return;
    setView(null);
    setError(false);
    setKind(next);
  };

  const saveTags = useCallback(async (id: string, tags: TriageTag[]) => {
    try {
      const response = await fetch("/api/admin/triage/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCaseId: id, tags }),
      });
      if (!response.ok) return false;
      const saved = (await response.json() as { tags: TriageTag[] }).tags;
      setView((current) => current && {
        ...current,
        groups: current.groups.map((group) => ({
          ...group,
          items: group.items.map((item) => item.id === id ? { ...item, tags: saved } : item),
        })),
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  const groups = view?.groups
    .map((group) => ({ ...group, items: group.items.filter((item) => matchesFilter(item, filter)) }))
    .filter((group) => group.items.length > 0) ?? [];

  return (
    <div className="mt-6">
      <div role="tablist" aria-label="Triage lists" className="flex gap-2">
        {(["slip", "false_positive"] as const).map((option) => (
          <Button
            key={option}
            role="tab"
            aria-selected={kind === option}
            variant={kind === option ? "default" : "outline"}
            onClick={() => selectKind(option)}
          >
            {KIND_LABELS[option]}{view ? ` (${view.counts[option]})` : ""}
          </Button>
        ))}
      </div>
      <div role="tabpanel" aria-label={KIND_LABELS[kind]} className="mt-4">
        <p className="text-sm text-muted-foreground">{KIND_HINTS[kind]}</p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          Show
          <select
            className="rounded-md border bg-background px-2 py-1"
            value={filter}
            onChange={(event) => setFilter(event.target.value as TagFilter)}
          >
            <option value="all">All</option>
            <option value="untagged">Untagged</option>
            {TRIAGE_TAGS.map((tag) => <option key={tag} value={tag}>Tagged {tag}</option>)}
          </select>
        </label>
        {error ? <p role="alert" className="mt-6">Triage is unavailable. Please reload to try again.</p>
          : view === null ? <p role="status" className="mt-6">Loading…</p>
          : groups.length === 0 ? <p className="mt-6">Nothing to triage here yet.</p>
          : groups.map((group) => (
            <section key={group.rule} className="mt-6" aria-labelledby={`rule-${group.rule}`}>
              <h2 id={`rule-${group.rule}`} className="font-heading text-xl font-semibold">
                {group.label} <span className="text-muted-foreground">({group.items.length})</span>
              </h2>
              <ul className="mt-3 space-y-3">
                {group.items.map((item) => <TriageCard key={item.id} item={item} onTags={saveTags} />)}
              </ul>
            </section>
          ))}
      </div>
    </div>
  );
}
