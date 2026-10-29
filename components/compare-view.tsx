"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client-api";
import { EvidenceImage, type BBox, type Overlay } from "./evidence-image";
import { Button, Card, ErrorNote, ProvenanceTag, Sha, TestBadge } from "./ui";

type EvidenceRef = { observationId: string; bbox?: BBox };
type Event = {
  id: string;
  key: string;
  type: "added" | "removed" | "moved" | "connection_changed" | "attribute_changed" | "unresolved";
  entityKind: string;
  description: string;
  evidence: { baseline: EvidenceRef[]; candidate: EvidenceRef[] };
  provenance: string;
};
type Finding = {
  id: string;
  rank: number;
  kind: "physical" | "code";
  title: string;
  explanation: string;
  suggestedCheck: string;
  score: number;
  breakdown: { evidenceStrength: number; changeRelevance: number; testTransitionWeight: number; provenanceWeight: number; reasons: string[] };
  uncertainty: "low" | "medium" | "high";
  evidence: { diffEventIds?: string[]; files?: string[]; relatedTests: string[] };
  explanationSource: string;
  userOutcome: string | null;
};
type Side = {
  checkpoint: { id: string; label: string };
  captureId: string | null;
  tests: { name: string; status: string; source: string }[];
  git?: { commit_sha: string; is_dirty: number | null; commit_message: string | null; changedFiles: { path: string; changedLines: string[] }[] };
};
type Comparison = {
  id: string;
  projectId: string;
  algorithmVersion: string;
  summary: { counts: Record<string, number>; transitions: { name: string; before: string; after: string }[]; codeChanges: string[] };
  baseline: Side;
  candidate: Side;
  events: Event[];
  findings: Finding[];
};

const EVENT_STYLE: Record<Event["type"], { label: string; tone: Overlay["tone"]; icon: string; cls: string }> = {
  added: { label: "Added", tone: "added", icon: "+", cls: "text-added border-added/50" },
  removed: { label: "Not visible", tone: "removed", icon: "−", cls: "text-removed border-removed/50" },
  moved: { label: "Moved", tone: "changed", icon: "↔", cls: "text-changed border-changed/50" },
  connection_changed: { label: "Connection changed", tone: "changed", icon: "~", cls: "text-changed border-changed/50" },
  attribute_changed: { label: "Attribute changed", tone: "changed", icon: "~", cls: "text-changed border-changed/50" },
  unresolved: { label: "Unresolved", tone: "unknown", icon: "?", cls: "text-unknown border-line" },
};

export function CompareView({ id }: { id: string }) {
  const [data, setData] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mobileSide, setMobileSide] = useState<"baseline" | "candidate">("candidate");
  const [dims, setDims] = useState<Record<string, { w: number; h: number }>>({});

  const load = () => api<Comparison>(`/comparisons/${id}`).then(setData, (e) => setError(e.message));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Read real image dimensions so overlays use the true aspect ratio.
  useEffect(() => {
    if (!data) return;
    for (const cid of [data.baseline.captureId, data.candidate.captureId]) {
      if (!cid || dims[cid]) continue;
      const img = new Image();
      img.onload = () => setDims((d) => ({ ...d, [cid]: { w: img.naturalWidth, h: img.naturalHeight } }));
      img.src = `/api/captures/${cid}/image`;
    }
  }, [data, dims]);

  const physical = useMemo(() => data?.events ?? [], [data]);
  if (error && !data) return <ErrorNote message={error} />;
  if (!data) return <p className="text-muted">Loading comparison…</p>;

  const selEvent = physical.find((e) => e.id === selected);
  const overlaysFor = (side: "baseline" | "candidate"): Overlay[] =>
    physical
      .filter((e) => !selected || e.id === selected)
      .flatMap((e) =>
        e.evidence[side]
          .filter((r) => r.bbox)
          .map((r, i) => ({
            id: `${e.id}:${i}`,
            bbox: r.bbox!,
            label: EVENT_STYLE[e.type].label,
            line: e.type === "unresolved" ? ("dotted" as const) : e.provenance === "USER_CONFIRMED" ? ("solid" as const) : ("dashed" as const),
            tone: EVENT_STYLE[e.type].tone,
            selected: e.id === selected,
          })),
      );

  const regressions = data.summary.transitions.filter((t) => t.before === "pass" && (t.after === "fail" || t.after === "error"));
  const recoveries = data.summary.transitions.filter((t) => (t.before === "fail" || t.before === "error") && t.after === "pass");
  const codeFiles = data.candidate.git?.changedFiles ?? [];

  const image = (side: "baseline" | "candidate") => {
    const s = data[side];
    const d = s.captureId ? dims[s.captureId] : undefined;
    if (!s.captureId) return <div className="grid aspect-video place-items-center rounded-lg border border-dashed border-line text-muted">No photo</div>;
    if (!d) return <div className="aspect-video animate-pulse rounded-lg bg-raised" />;
    return (
      <EvidenceImage
        src={`/api/captures/${s.captureId}/image`}
        width={d.w}
        height={d.h}
        alt={`${side === "baseline" ? "Before" : "After"}: ${s.checkpoint.label}`}
        overlays={overlaysFor(side)}
        onSelect={(oid) => setSelected(oid.split(":")[0])}
      />
    );
  };

  return (
    <div className="grid gap-5">
      <div>
        <Link href={`/projects/${data.projectId}`} className="text-sm text-muted hover:text-fg">
          ← Timeline
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">
          {data.baseline.checkpoint.label} <span className="text-muted">→</span> {data.candidate.checkpoint.label}
        </h1>
      </div>

      {/* Summary strip */}
      <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-muted">Tests</span>
          {data.summary.transitions.length === 0 ? <span className="text-muted">no test evidence</span> : null}
          {data.summary.transitions.map((t) => (
            <span key={t.name} className="inline-flex items-center gap-1">
              <TestBadge status={t.before} name={t.name} />
              <span aria-label="became">→</span>
              <TestBadge status={t.after} />
            </span>
          ))}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-muted">Commit</span>
          <Sha sha={data.baseline.git?.commit_sha} /> → <Sha sha={data.candidate.git?.commit_sha} dirty={data.candidate.git?.is_dirty} />
        </span>
        <span>
          <strong>{physical.length}</strong> visible change{physical.length === 1 ? "" : "s"} detected
        </span>
      </Card>

      {regressions.length > 0 && <p className="text-sm text-danger">✕ {regressions.map((r) => r.name).join(", ")} changed from PASS to FAIL between these checkpoints.</p>}
      {recoveries.length > 0 && <p className="text-sm text-success">✓ {recoveries.map((r) => r.name).join(", ")} changed from FAIL to PASS between these checkpoints.</p>}

      {/* Images: two panes on desktop, toggle on mobile */}
      <div className="flex gap-2 md:hidden" role="tablist" aria-label="Photo">
        {(["baseline", "candidate"] as const).map((s) => (
          <Button key={s} role="tab" aria-selected={mobileSide === s} variant={mobileSide === s ? "primary" : "secondary"} className="flex-1" onClick={() => setMobileSide(s)}>
            {s === "baseline" ? "Before" : "After"}
          </Button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className={mobileSide === "baseline" ? "" : "hidden md:block"}>
          <h2 className="mb-1 text-sm font-medium text-muted">Before · {data.baseline.checkpoint.label}</h2>
          {image("baseline")}
        </div>
        <div className={mobileSide === "candidate" ? "" : "hidden md:block"}>
          <h2 className="mb-1 text-sm font-medium text-muted">After · {data.candidate.checkpoint.label}</h2>
          {image("candidate")}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Change list: the accessible text alternative to the overlays */}
        <section aria-labelledby="changes-heading" className="grid h-fit gap-4">
          <Card className="p-4">
            <h2 id="changes-heading" className="font-semibold">
              Physical changes
            </h2>
            {physical.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No supported visible changes found.</p>
            ) : (
              <ul className="mt-2 grid gap-2">
                {physical.map((e) => {
                  const st = EVENT_STYLE[e.type];
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        aria-pressed={selected === e.id}
                        onClick={() => setSelected(selected === e.id ? null : e.id)}
                        className={`grid w-full gap-1 rounded-lg border p-3 text-left text-sm hover:border-accent ${selected === e.id ? "border-accent bg-raised" : "border-line"}`}
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          <span className={`rounded border px-1.5 font-mono text-xs ${st.cls}`}>
                            {st.icon} {st.label}
                          </span>
                          <ProvenanceTag provenance={e.provenance} />
                        </span>
                        <span>{e.description}</span>
                        <span className="text-xs text-accent">{selected === e.id ? "Highlighted on both photos" : "Inspect on image"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card className="p-4">
            <h2 className="font-semibold">Code changes</h2>
            {codeFiles.length === 0 && data.summary.codeChanges.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No Git changes recorded between these checkpoints.</p>
            ) : (
              <ul className="mt-2 grid gap-2">
                {codeFiles.map((f) => (
                  <li key={f.path} className="text-sm">
                    <div className="font-mono text-xs">{f.path}</div>
                    {f.changedLines.length > 0 && (
                      <pre className="mt-1 overflow-x-auto rounded bg-bg p-2 font-mono text-xs">
                        {f.changedLines.map((l, i) => (
                          <div key={i} className={l.startsWith("+") ? "text-added" : l.startsWith("-") ? "text-removed" : "text-muted"}>
                            {l}
                          </div>
                        ))}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {data.candidate.git?.commit_message ? <p className="mt-2 text-xs text-muted">Commit message: “{data.candidate.git.commit_message}”</p> : null}
          </Card>
        </section>

        <section aria-labelledby="suspects-heading" className="grid h-fit gap-3">
          <div>
            <h2 id="suspects-heading" className="font-semibold">
              Possible causes to inspect
            </h2>
            <p className="text-xs text-muted">Ranked by a transparent score (evidence × relevance × test transition × provenance). A ranking, not a diagnosis: correlation is not proof of cause.</p>
          </div>
          {data.findings.length === 0 && <Card className="p-4 text-sm text-muted">Nothing changed that could explain a regression.</Card>}
          {data.findings.map((f) => (
            <SuspectCard key={f.id} f={f} events={physical} selected={selected} onInspect={setSelected} onOutcome={load} />
          ))}
          {selEvent && (
            <p className="text-xs text-muted">
              Showing evidence for: <span className="text-fg">{selEvent.description}</span>
            </p>
          )}
        </section>
      </div>
      <p className="text-xs text-muted">Diff algorithm {data.algorithmVersion}. Photos cannot verify electrical continuity, voltage or component values.</p>
    </div>
  );
}

function SuspectCard({ f, events, selected, onInspect, onOutcome }: { f: Finding; events: Event[]; selected: string | null; onInspect: (id: string) => void; onOutcome: () => void }) {
  const linked = (f.evidence.diffEventIds ?? []).map((id) => events.find((e) => e.id === id)).filter((e): e is Event => !!e);
  const b = f.breakdown;
  return (
    <Card className={`p-4 ${f.rank === 1 ? "border-accent/60" : ""} ${linked.some((e) => e.id === selected) ? "ring-1 ring-accent" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="font-mono text-lg text-muted">#{f.rank}</span>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{f.title}</span>
            <span className="rounded border border-line px-1.5 text-[11px] text-muted">{f.kind === "physical" ? "physical" : "code"}</span>
            <span className={`text-[11px] ${f.uncertainty === "low" ? "text-success" : f.uncertainty === "medium" ? "text-warning" : "text-unknown"}`}>{f.uncertainty} uncertainty</span>
            {f.evidence.relatedTests.map((t) => (
              <span key={t} className="font-mono text-[11px] text-danger">
                ↳ {t}
              </span>
            ))}
          </div>
          <p className="mt-1 text-sm text-muted">{f.explanation}</p>
          <p className="mt-2 text-sm">
            <span className="text-muted">Suggested check: </span>
            {f.suggestedCheck}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {linked.map((e) => (
              <Button key={e.id} variant="ghost" className="min-h-8 px-2 py-1 text-xs text-accent" onClick={() => onInspect(e.id)}>
                Show evidence on photos
              </Button>
            ))}
            {f.evidence.files?.map((p) => (
              <span key={p} className="font-mono text-xs text-muted">
                {p}
              </span>
            ))}
          </div>
          <details className="mt-2 text-xs text-muted">
            <summary className="cursor-pointer">
              Score {f.score.toFixed(2)} — why
            </summary>
            <div className="mt-1 font-mono">
              {b.evidenceStrength} evidence × {b.changeRelevance} relevance × {b.testTransitionWeight} test × {b.provenanceWeight} provenance
            </div>
            <ul className="mt-1 list-disc pl-5">
              {b.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </details>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted">Was this the cause?</span>
            {(["confirmed", "rejected", "unresolved"] as const).map((o) => (
              <button
                key={o}
                type="button"
                aria-pressed={f.userOutcome === o}
                className={`rounded-full border px-2 py-0.5 ${f.userOutcome === o ? "border-accent text-accent" : "border-line text-muted hover:text-fg"}`}
                onClick={async () => {
                  await api(`/findings/${f.id}`, { method: "PATCH", body: { outcome: o } });
                  onOutcome();
                }}
              >
                {o === "confirmed" ? "Yes, confirmed" : o === "rejected" ? "No" : "Not sure"}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
