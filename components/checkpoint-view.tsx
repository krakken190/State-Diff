"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { ReviewPanel, type ReviewComponent, type ReviewConnection } from "./review-panel";
import { Button, Card, CheckpointStatus, ErrorNote, Sha, TestBadge, timeAgo } from "./ui";

export type CheckpointPayload = {
  checkpoint: { id: string; project_id: string; label: string; status: string; created_at: string; sealed_at: string | null; notes: string | null };
  project: { id: string; name: string };
  captures: { id: string; width: number; height: number; sha256: string }[];
  analysis: null | {
    id: string;
    status: string;
    provider: string;
    model_id: string;
    error_code: string | null;
    error_message: string | null;
    uncertainties_json: string;
    warnings_json: string;
    meta: { latencyMs?: number; estimatedCostUsd?: number; recordedAt?: string; promptVersion?: string };
  };
  revision: number;
  components: ReviewComponent[];
  connections: ReviewConnection[];
  tests: { id: string; name: string; status: string; source: string; output_excerpt: string | null; recorded_at: string }[];
  git: null | { commit_sha: string; branch_name: string | null; is_dirty: number | null; commit_message: string | null; source: string; changedFiles: { path: string }[] };
};

export function CheckpointView({ id }: { id: string }) {
  const [data, setData] = useState<CheckpointPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => api<CheckpointPayload>(`/checkpoints/${id}`).then(setData, (e) => setError(e.message)), [id]);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      await load();
    }
  };

  if (error && !data) return <ErrorNote message={error} />;
  if (!data) return <p className="text-muted">Loading checkpoint…</p>;

  const { checkpoint: cp, captures, analysis } = data;
  const capture = captures[0];
  const sealed = cp.status === "sealed";
  const reviewing = cp.status === "needs_review" || sealed;

  return (
    <div className="grid gap-5">
      <div>
        <Link href={`/projects/${data.project.id}`} className="text-sm text-muted hover:text-fg">
          ← {data.project.name}
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-semibold">{cp.label}</h1>
          <CheckpointStatus status={cp.status} />
          <span className="text-xs text-muted">{timeAgo(cp.created_at)}</span>
        </div>
      </div>

      <ErrorNote message={error} />

      {!capture && <CaptureStep busy={busy} onUpload={(file) => run("upload", () => { const f = new FormData(); f.append("file", file); return api(`/checkpoints/${id}/captures`, { form: f }); })} />}

      {capture && !reviewing && (
        <Card className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_320px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/captures/${capture.id}/image`} alt="Captured workbench photo" className="w-full rounded-lg border border-line" />
          <div className="grid h-fit gap-3">
            <h2 className="font-semibold">Analyze the photo</h2>
            <p className="text-sm text-muted">
              The photo (EXIF stripped, max 1600 px) is sent to Meta&apos;s Muse Spark model to list visible parts and wire endpoints. You review everything before it becomes history.
            </p>
            {busy === "analyze" ? (
              <p role="status" className="text-sm text-accent">
                Analyzing visible components… (this can take up to a minute)
              </p>
            ) : null}
            {analysis?.status === "failed" && (
              <div className="rounded-lg border border-danger/40 p-3 text-sm">
                <div className="font-medium text-danger">Analysis failed · {analysis.error_code}</div>
                <div className="mt-1 text-muted">{analysis.error_message}</div>
                <div className="mt-1 text-muted">Your photo is safe. Retry, or continue by marking parts yourself.</div>
              </div>
            )}
            <Button variant="primary" disabled={!!busy} onClick={() => run("analyze", () => api(`/checkpoints/${id}/analyze`, { body: { force: analysis?.status === "failed" } }))}>
              {analysis?.status === "failed" ? "Retry analysis" : "Analyze visible components"}
            </Button>
            <Button variant="ghost" disabled={!!busy} onClick={() => run("manual", () => api(`/checkpoints/${id}/manual-review`, { body: {} }))}>
              Continue without AI (mark parts manually)
            </Button>
          </div>
        </Card>
      )}

      {capture && reviewing && (
        <>
          <AnalysisBanner analysis={analysis} />
          <ReviewPanel data={data} capture={capture} readOnly={sealed} onChanged={load} onError={setError} />
        </>
      )}

      {capture && <EvidencePanel data={data} busy={busy} run={run} />}

      {cp.status === "needs_review" && <SealBar data={data} busy={busy} onSeal={() => run("seal", () => api(`/checkpoints/${id}/seal`, { body: {} }))} />}
      {sealed && (
        <Card className="flex flex-wrap items-center gap-3 border-success/40 p-4">
          <span aria-hidden className="text-success">
            ●
          </span>
          <span className="flex-1 text-sm">Sealed {timeAgo(cp.sealed_at)}. This snapshot is immutable; it can now be compared with other checkpoints.</span>
          <Link href={`/projects/${data.project.id}`} className="text-sm text-accent hover:underline">
            Back to timeline
          </Link>
        </Card>
      )}
    </div>
  );
}

function CaptureStep({ busy, onUpload }: { busy: string | null; onUpload: (f: File) => void }) {
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  return (
    <Card className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_320px]">
      <div className="relative grid min-h-64 place-items-center overflow-hidden rounded-lg border border-dashed border-line bg-bg">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.url} alt="Selected photo preview" className="w-full" />
        ) : (
          <div className="p-6 text-center text-sm text-muted">
            <div className="text-fg">Overhead photo of the whole bench</div>
            <ul className="mt-2 grid gap-1">
              <li>Keep the board and every wire endpoint visible</li>
              <li>Even light, minimal glare</li>
              <li>Same camera position as your other checkpoints</li>
            </ul>
          </div>
        )}
        {/* Alignment grid helps keep the viewpoint stable between checkpoints. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="border border-white/5" />
          ))}
        </div>
      </div>
      <div className="grid h-fit gap-3">
        <h2 className="font-semibold">Add photo</h2>
        <label className="grid gap-2 text-sm">
          <span>Take or choose a photo</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            capture="environment"
            className="text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-raised file:px-3 file:py-2 file:text-fg"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setPreview({ file, url: URL.createObjectURL(file) });
            }}
          />
        </label>
        <p className="text-xs text-muted">Stored only on this computer. Max 12 MB. Nothing is sent to an AI model until you click Analyze.</p>
        <Button variant="primary" disabled={!preview || !!busy} onClick={() => preview && onUpload(preview.file)}>
          {busy === "upload" ? "Uploading photo…" : "Use this photo"}
        </Button>
        {preview && (
          <Button variant="ghost" onClick={() => setPreview(null)}>
            Retake
          </Button>
        )}
      </div>
    </Card>
  );
}

function AnalysisBanner({ analysis }: { analysis: CheckpointPayload["analysis"] }) {
  if (!analysis || analysis.status !== "succeeded") {
    return <p className="text-sm text-muted">Manual review: no AI analysis was used for this checkpoint.</p>;
  }
  const uncertainties: string[] = JSON.parse(analysis.uncertainties_json || "[]");
  const warnings: { message: string }[] = JSON.parse(analysis.warnings_json || "[]");
  const m = analysis.meta;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        {analysis.provider === "replay" ? (
          <span className="rounded border border-warning/60 px-1.5 py-0.5 text-warning">
            Replay of a recorded Meta response{m.recordedAt ? ` from ${timeAgo(m.recordedAt)}` : ""} — not a live call
          </span>
        ) : (
          <span className="rounded border border-line px-1.5 py-0.5">Live Meta inference</span>
        )}
        <span className="font-mono">{analysis.model_id}</span>
        {m.latencyMs ? <span>{(m.latencyMs / 1000).toFixed(1)} s</span> : null}
        {m.estimatedCostUsd != null ? <span>≈ ${m.estimatedCostUsd.toFixed(4)}</span> : null}
        {m.promptVersion ? <span className="font-mono">{m.promptVersion}</span> : null}
      </div>
      {(uncertainties.length > 0 || warnings.length > 0) && (
        <details className="rounded-lg border border-warning/30 px-3 py-2 text-sm">
          <summary className="cursor-pointer text-warning">
            Model noted {uncertainties.length + warnings.length} uncertaint{uncertainties.length + warnings.length === 1 ? "y" : "ies"}
          </summary>
          <ul className="mt-2 list-disc pl-5 text-muted">
            {uncertainties.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
            {warnings.map((w, i) => (
              <li key={`w${i}`}>{w.message}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function EvidencePanel({ data, busy, run }: { data: CheckpointPayload; busy: string | null; run: (l: string, fn: () => Promise<unknown>) => Promise<void> }) {
  const id = data.checkpoint.id;
  const [showTest, setShowTest] = useState(false);
  const [showGit, setShowGit] = useState(false);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Test results</h2>
          <Button variant="ghost" onClick={() => setShowTest((v) => !v)}>
            + Add manually
          </Button>
        </div>
        {data.tests.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No test attached. Attach a test result to correlate this checkpoint.</p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {data.tests.map((t) => (
              <li key={t.id} className="grid gap-1">
                <TestBadge status={t.status} name={t.name} source={t.source} />
                {t.output_excerpt ? <pre className="overflow-x-auto rounded bg-bg p-2 font-mono text-xs text-muted">{t.output_excerpt}</pre> : null}
              </li>
            ))}
          </ul>
        )}
        {showTest && (
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run("test", () => api(`/checkpoints/${id}/test-runs`, { body: { runs: [{ name: String(f.get("name")), status: String(f.get("status")), source: "manual" }] } }));
              setShowTest(false);
            }}
          >
            <input name="name" required placeholder="motor_test" aria-label="Test name" className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 py-1.5 font-mono text-sm" />
            <select name="status" aria-label="Result" className="rounded-lg border border-line bg-bg px-2 py-1.5 text-sm">
              <option value="pass">PASS</option>
              <option value="fail">FAIL</option>
              <option value="skipped">SKIP</option>
              <option value="unknown">UNKNOWN</option>
            </select>
            <Button type="submit" disabled={!!busy}>
              Save (labelled manual)
            </Button>
          </form>
        )}
      </Card>
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Git revision</h2>
          <Button variant="ghost" onClick={() => setShowGit((v) => !v)}>
            + Link manually
          </Button>
        </div>
        {data.git ? (
          <div className="mt-2 grid gap-1 text-sm">
            <div>
              <Sha sha={data.git.commit_sha} dirty={data.git.is_dirty} /> <span className="text-muted">on {data.git.branch_name ?? "unknown branch"} · {data.git.source}</span>
            </div>
            {data.git.commit_message ? <div className="text-muted">“{data.git.commit_message}”</div> : null}
            {data.git.changedFiles.length > 0 ? (
              <div className="font-mono text-xs text-muted">changed: {data.git.changedFiles.map((f) => f.path).join(", ")}</div>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">Not linked. Use the CLI (`pnpm sd checkpoint`) or link a commit SHA manually.</p>
        )}
        {showGit && (
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run("git", () => api(`/checkpoints/${id}/git-revisions`, { body: { commitSha: String(f.get("sha")).trim(), branch: String(f.get("branch") || "") || undefined, source: "manual" } }));
              setShowGit(false);
            }}
          >
            <input name="sha" required pattern="[0-9a-fA-F]{40}" placeholder="full 40-char commit SHA" aria-label="Commit SHA" className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 py-1.5 font-mono text-sm" />
            <input name="branch" placeholder="branch" aria-label="Branch" className="w-28 rounded-lg border border-line bg-bg px-2 py-1.5 font-mono text-sm" />
            <Button type="submit" disabled={!!busy}>
              Save
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}

function SealBar({ data, busy, onSeal }: { data: CheckpointPayload; busy: string | null; onSeal: () => void }) {
  const kept = data.components.filter((c) => c.review !== "rejected");
  const wires = data.connections.filter((c) => c.review !== "rejected");
  const confirmed = [...kept, ...wires].filter((c) => c.review !== "pending").length;
  const unresolved = wires.filter((w) => w.endpointA.certainty === "unknown" || w.endpointB.certainty === "unknown").length;
  return (
    <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
        <span className="flex-1 text-sm text-muted">
          {kept.length} parts · {wires.length} wires · {confirmed} reviewed by you · {unresolved} unresolved endpoint{unresolved === 1 ? "" : "s"}. Unreviewed items are saved as AI observations, not facts.
        </span>
        <Button variant="primary" disabled={!!busy || kept.length === 0} onClick={onSeal}>
          {busy === "seal" ? "Sealing…" : "Seal checkpoint"}
        </Button>
      </div>
    </div>
  );
}
