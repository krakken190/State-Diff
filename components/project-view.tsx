"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { Button, Card, CheckpointStatus, ErrorNote, Sha, TestBadge, timeAgo } from "./ui";

type TimelineItem = {
  id: string;
  label: string;
  status: string;
  created_at: string;
  captureId: string | null;
  analysisProvider: string | null;
  tests: { name: string; status: string; source: string }[];
  git: { commit_sha: string; is_dirty: number | null; branch_name: string | null; commit_message: string | null } | undefined;
};
type ProjectPayload = {
  project: { id: string; name: string; description: string | null; hardware_context: string | null };
  timeline: TimelineItem[];
  comparisons: { id: string; baseline_checkpoint_id: string; candidate_checkpoint_id: string; created_at: string }[];
};

export function ProjectView({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<ProjectPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [pins, setPins] = useState<string | null>(null);

  const load = useCallback(() => {
    api<ProjectPayload>(`/projects/${id}`).then(setData, (e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  if (error && !data) return <ErrorNote message={error} />;
  if (!data) return <p className="text-muted">Loading project…</p>;

  const sealed = data.timeline.filter((c) => c.status === "sealed");
  const toggle = (cid: string) =>
    setSelected((s) => (s.includes(cid) ? s.filter((x) => x !== cid) : [...s, cid].slice(-2)));
  const ordered = data.timeline.filter((c) => selected.includes(c.id)).map((c) => c.id);

  // Suggest the most useful comparison: last passing → first failing after it.
  const lastPassThenFail = (() => {
    for (let i = sealed.length - 1; i > 0; i--) {
      const fails = sealed[i].tests.some((t) => t.status === "fail" || t.status === "error");
      if (!fails) continue;
      for (let j = i - 1; j >= 0; j--) {
        if (sealed[j].tests.length > 0 && sealed[j].tests.every((t) => t.status === "pass")) return [sealed[j].id, sealed[i].id];
      }
    }
    return null;
  })();

  const compare = async (pair: string[]) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ id: string }>("/comparisons", { body: { baselineCheckpointId: pair[0], candidateCheckpointId: pair[1] } });
      router.push(`/compare/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1">
          <Link href="/" className="text-sm text-muted hover:text-fg">
            ← Projects
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{data.project.name}</h1>
          {data.project.description ? <p className="text-sm text-muted">{data.project.description}</p> : null}
        </div>
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            const label = window.prompt("Checkpoint label", data.timeline.length === 0 ? "Known-good baseline" : "After changes");
            if (!label) return;
            try {
              const cp = await api<{ id: string }>(`/projects/${id}/checkpoints`, { body: { label } });
              router.push(`/checkpoints/${cp.id}`);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          {data.timeline.length === 0 ? "Capture known-good state" : "New checkpoint"}
        </Button>
      </div>

      <ErrorNote message={error} />

      {lastPassThenFail && (
        <Card className="flex flex-wrap items-center gap-3 border-danger/40 p-4">
          <span aria-hidden className="text-danger">
            ✕
          </span>
          <span className="flex-1 text-sm">A test went from PASS to FAIL. Compare the last passing checkpoint with the first failing one.</span>
          <Button variant="primary" disabled={busy} onClick={() => compare(lastPassThenFail)}>
            What changed since the last passing test?
          </Button>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section aria-labelledby="timeline-heading">
          <div className="flex items-center justify-between">
            <h2 id="timeline-heading" className="font-semibold">
              Timeline
            </h2>
            <Button variant="secondary" disabled={ordered.length !== 2 || busy} onClick={() => compare(ordered)}>
              Compare selected ({ordered.length}/2)
            </Button>
          </div>
          {data.timeline.length === 0 ? (
            <Card className="mt-3 p-6 text-muted">Capture a known-good baseline.</Card>
          ) : (
            <ol className="mt-3 grid gap-3">
              {data.timeline.map((c, i) => (
                <li key={c.id}>
                  <Card className="flex gap-3 p-3">
                    <div className="flex flex-col items-center pt-1">
                      <input
                        type="checkbox"
                        aria-label={`Select ${c.label} for comparison`}
                        className="h-5 w-5 accent-[var(--accent)]"
                        disabled={c.status !== "sealed"}
                        checked={selected.includes(c.id)}
                        onChange={() => toggle(c.id)}
                      />
                      <span className="mt-2 font-mono text-xs text-muted">#{i + 1}</span>
                    </div>
                    <Link href={`/checkpoints/${c.id}`} className="shrink-0">
                      {c.captureId ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/captures/${c.captureId}/image`} alt="" className="h-20 w-28 rounded-md border border-line object-cover" />
                      ) : (
                        <div className="grid h-20 w-28 place-items-center rounded-md border border-dashed border-line text-xs text-muted">No photo</div>
                      )}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Link href={`/checkpoints/${c.id}`} className="font-medium hover:underline">
                          {c.label}
                        </Link>
                        <CheckpointStatus status={c.status} />
                        {c.analysisProvider === "replay" ? <span className="rounded border border-warning/50 px-1 text-[11px] text-warning">replayed analysis</span> : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                        <span>{timeAgo(c.created_at)}</span>
                        <span>
                          Commit <Sha sha={c.git?.commit_sha} dirty={c.git?.is_dirty} />
                        </span>
                        {c.git?.commit_message ? <span className="truncate">“{c.git.commit_message}”</span> : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {c.tests.length === 0 ? <span className="text-xs text-muted">No test attached</span> : c.tests.map((t) => <TestBadge key={t.name} {...t} />)}
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="grid h-fit gap-4">
          <Card className="p-4">
            <h2 className="font-semibold">Pin map</h2>
            <p className="mt-1 text-xs text-muted">Firmware pin assignments. Used only to rank suspects; never treated as observed wiring.</p>
            <textarea
              aria-label="Pin map"
              className="mt-2 w-full rounded-lg border border-line bg-bg p-2 font-mono text-xs"
              rows={4}
              value={pins ?? data.project.hardware_context ?? ""}
              onChange={(e) => setPins(e.target.value)}
            />
            {pins !== null && (
              <Button
                className="mt-2"
                onClick={async () => {
                  await api(`/projects/${id}`, { method: "PATCH", body: { hardwareContext: pins } });
                  setPins(null);
                  load();
                }}
              >
                Save pin map
              </Button>
            )}
          </Card>
          {data.comparisons.length > 0 && (
            <Card className="p-4">
              <h2 className="font-semibold">Comparisons</h2>
              <ul className="mt-2 grid gap-1 text-sm">
                {data.comparisons.map((c) => {
                  const a = data.timeline.find((t) => t.id === c.baseline_checkpoint_id);
                  const b = data.timeline.find((t) => t.id === c.candidate_checkpoint_id);
                  return (
                    <li key={c.id}>
                      <Link className="text-accent hover:underline" href={`/compare/${c.id}`}>
                        {a?.label ?? "?"} → {b?.label ?? "?"}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          <Card className="p-4">
            <h2 className="font-semibold text-danger">Delete project</h2>
            <p className="mt-1 text-xs text-muted">Removes all photos, observations and history from this computer.</p>
            <Button
              variant="danger"
              className="mt-2"
              onClick={async () => {
                if (!window.confirm(`Delete "${data.project.name}" and all its photos? This cannot be undone.`)) return;
                await api(`/projects/${id}`, { method: "DELETE" });
                router.push("/");
                router.refresh();
              }}
            >
              Delete project
            </Button>
          </Card>
        </aside>
      </div>
    </div>
  );
}
