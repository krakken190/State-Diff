"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";
import type { CheckpointPayload } from "./checkpoint-view";
import { EvidenceImage, type BBox, type Overlay } from "./evidence-image";
import { Button, Card, confidenceBand, ProvenanceTag } from "./ui";

type Endpoint = { componentKey: string; terminalLabel: string; certainty: "visible" | "inferred" | "unknown" };
type History = { revision: number; summary: string; createdAt: string };
type Review = "pending" | "accepted" | "rejected" | "corrected";

export type ReviewComponent = {
  observationId: string;
  key: string;
  kind: string;
  label: string;
  bbox: BBox;
  confidence: number | null;
  review: Review;
  source: "vision" | "manual";
  original?: { label: string };
  evidenceNote: string;
  history: History[];
};

export type ReviewConnection = {
  observationId: string;
  key: string;
  wireColor: string;
  endpointA: Endpoint;
  endpointB: Endpoint;
  confidence: number | null;
  review: Review;
  source: "vision" | "manual";
  confirmedA: boolean;
  confirmedB: boolean;
  endpointsConfirmed: boolean;
  bbox: BBox;
  evidenceNote: string;
  history: History[];
};

type Selection = { type: "component" | "connection"; id: string } | null;
type Draft = { type: "component" | "connection"; bbox: BBox } | null;

const isUnresolved = (w: ReviewConnection) => w.endpointA.certainty === "unknown" || w.endpointB.certainty === "unknown";

export function ReviewPanel({
  data,
  capture,
  readOnly,
  onChanged,
  onError,
}: {
  data: CheckpointPayload;
  capture: { id: string; width: number; height: number };
  readOnly: boolean;
  onChanged: () => Promise<unknown>;
  onError: (m: string | null) => void;
}) {
  const [selected, setSelected] = useState<Selection>(null);
  const [drawing, setDrawing] = useState<"component" | "connection" | null>(null);
  const [draft, setDraft] = useState<Draft>(null);
  const [saving, setSaving] = useState(false);

  const compLabel = (key: string) => data.components.find((c) => c.key === key)?.label ?? key;
  const epText = (e: Endpoint) => (e.certainty === "unknown" ? "unknown" : `${compLabel(e.componentKey)} · ${e.terminalLabel}`);

  const correct = async (correction: Record<string, unknown>) => {
    setSaving(true);
    onError(null);
    try {
      await api(`/checkpoints/${data.checkpoint.id}/corrections`, { body: { expectedRevision: data.revision, correction } });
      await onChanged();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const overlays: Overlay[] = [
    ...data.components
      .filter((c) => c.review !== "rejected")
      .map<Overlay>((c) => ({
        id: `component:${c.observationId}`,
        bbox: c.bbox,
        label: c.label,
        line: c.review === "pending" ? "dashed" : "solid",
        tone: "accent",
        selected: selected?.id === c.observationId,
      })),
    ...data.connections
      .filter((w) => w.review !== "rejected")
      .map<Overlay>((w) => ({
        id: `connection:${w.observationId}`,
        bbox: w.bbox,
        label: `${w.wireColor} wire`,
        line: isUnresolved(w) ? "dotted" : w.endpointsConfirmed ? "solid" : "dashed",
        tone: isUnresolved(w) ? "unknown" : "changed",
        selected: selected?.id === w.observationId,
      })),
  ];

  const selComp = selected?.type === "component" ? data.components.find((c) => c.observationId === selected.id) : undefined;
  const selWire = selected?.type === "connection" ? data.connections.find((c) => c.observationId === selected.id) : undefined;
  const liveComponents = data.components.filter((c) => c.review !== "rejected");

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="grid h-fit gap-2">
        <EvidenceImage
          src={`/api/captures/${capture.id}/image`}
          width={capture.width}
          height={capture.height}
          alt="Workbench photo with observations (dashed = AI observation, solid = confirmed, dotted = unresolved)"
          overlays={overlays}
          onSelect={(oid) => {
            const [type, id] = oid.split(":") as ["component" | "connection", string];
            setSelected({ type, id });
          }}
          drawMode={!!drawing}
          onDraw={(bbox) => {
            setDraft({ type: drawing!, bbox });
            setDrawing(null);
          }}
        />
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <Button variant={drawing === "component" ? "primary" : "secondary"} onClick={() => setDrawing(drawing === "component" ? null : "component")}>
              {drawing === "component" ? "Drag a box around the part…" : "+ Add missing part"}
            </Button>
            <Button variant={drawing === "connection" ? "primary" : "secondary"} onClick={() => setDrawing(drawing === "connection" ? null : "connection")}>
              {drawing === "connection" ? "Drag a box around the wire…" : "+ Add missing wire"}
            </Button>
          </div>
        )}
        {draft && (
          <AddForm
            draft={draft}
            components={liveComponents}
            saving={saving}
            onCancel={() => setDraft(null)}
            onSave={async (c) => {
              await correct(c);
              setDraft(null);
            }}
          />
        )}
      </div>

      <div className="grid h-fit gap-4">
        {(selComp || selWire) && (
          <Card className="border-accent/60 p-4">
            {selComp && (
              <ComponentEditor key={selComp.observationId + data.revision} c={selComp} readOnly={readOnly} saving={saving} correct={correct} onClose={() => setSelected(null)} />
            )}
            {selWire && (
              <WireEditor
                key={selWire.observationId + data.revision}
                w={selWire}
                components={liveComponents}
                epText={epText}
                readOnly={readOnly}
                saving={saving}
                correct={correct}
                onClose={() => setSelected(null)}
              />
            )}
          </Card>
        )}

        <Card className="p-4">
          <h2 className="font-semibold">Parts ({liveComponents.length})</h2>
          {data.components.length === 0 && <p className="mt-2 text-sm text-muted">No parts yet. Use “Add missing part”.</p>}
          <ul className="mt-2 grid gap-1">
            {data.components.map((c) => (
              <li key={c.observationId}>
                <button
                  type="button"
                  onClick={() => setSelected({ type: "component", id: c.observationId })}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-raised ${selected?.id === c.observationId ? "bg-raised" : ""} ${c.review === "rejected" ? "text-muted line-through" : ""}`}
                >
                  <span className="flex-1 truncate">{c.label}</span>
                  <ReviewTag review={c.review} />
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <h2 className="font-semibold">Wires ({data.connections.filter((w) => w.review !== "rejected").length})</h2>
          {data.connections.length === 0 && <p className="mt-2 text-sm text-muted">No wires yet.</p>}
          <ul className="mt-2 grid gap-1">
            {data.connections.map((w) => (
              <li key={w.observationId}>
                <button
                  type="button"
                  onClick={() => setSelected({ type: "connection", id: w.observationId })}
                  className={`grid w-full gap-0.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-raised ${selected?.id === w.observationId ? "bg-raised" : ""} ${w.review === "rejected" ? "text-muted line-through" : ""}`}
                >
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full border border-line" style={{ background: w.wireColor || "transparent" }} />
                    <span className="flex-1 capitalize">{w.wireColor || "unknown colour"} wire</span>
                    {isUnresolved(w) ? <span className="text-xs text-unknown">? endpoint unresolved</span> : <ReviewTag review={w.review} />}
                  </span>
                  <span className="font-mono text-xs text-muted">
                    {epText(w.endpointA)} ↔ {epText(w.endpointB)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <p className="text-xs text-muted">A photo cannot verify electrical continuity. Confirming an endpoint records what you checked, not a measurement.</p>
      </div>
    </div>
  );
}

function ReviewTag({ review }: { review: Review }) {
  const map: Record<Review, [string, string]> = {
    pending: ["◌ AI", "text-muted"],
    accepted: ["● confirmed", "text-success"],
    corrected: ["● corrected", "text-success"],
    rejected: ["✕ dismissed", "text-muted"],
  };
  const [text, cls] = map[review];
  return <span className={`text-xs ${cls}`}>{text}</span>;
}

type Correct = (c: Record<string, unknown>) => Promise<void>;

function ComponentEditor({ c, readOnly, saving, correct, onClose }: { c: ReviewComponent; readOnly: boolean; saving: boolean; correct: Correct; onClose: () => void }) {
  const [label, setLabel] = useState(c.label);
  return (
    <div className="grid gap-3">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="font-medium">{c.label}</div>
          <div className="text-xs text-muted">
            {c.kind} · {c.source === "manual" ? "added by you" : confidenceBand(c.confidence)}
          </div>
        </div>
        <ProvenanceTag provenance={c.review === "pending" ? "VISION_INFERRED" : "USER_CONFIRMED"} />
        <button type="button" aria-label="Close" className="text-muted hover:text-fg" onClick={onClose}>
          ✕
        </button>
      </div>
      {c.evidenceNote ? <p className="text-sm text-muted">Evidence: {c.evidenceNote}</p> : null}
      {c.original && c.original.label !== c.label ? <p className="text-xs text-muted">AI originally said: “{c.original.label}”</p> : null}
      {!readOnly && c.review !== "rejected" && (
        <>
          <div className="flex gap-2">
            <input aria-label="Part name" value={label} onChange={(e) => setLabel(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 py-1.5 text-sm" />
            <Button disabled={saving || !label.trim() || label === c.label} onClick={() => correct({ action: "relabel", targetType: "component", targetId: c.observationId, label })}>
              Rename
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" disabled={saving || c.review !== "pending"} onClick={() => correct({ action: "accept", targetType: "component", targetId: c.observationId })}>
              Confirm part
            </Button>
            <Button variant="danger" disabled={saving} onClick={() => correct({ action: "reject", targetType: "component", targetId: c.observationId })}>
              Dismiss (not there)
            </Button>
          </div>
        </>
      )}
      <HistoryList history={c.history} />
    </div>
  );
}

function WireEditor({
  w,
  components,
  epText,
  readOnly,
  saving,
  correct,
  onClose,
}: {
  w: ReviewConnection;
  components: ReviewComponent[];
  epText: (e: Endpoint) => string;
  readOnly: boolean;
  saving: boolean;
  correct: Correct;
  onClose: () => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="font-medium capitalize">{w.wireColor || "Unknown colour"} wire</div>
          <div className="text-xs text-muted">{w.source === "manual" ? "added by you" : confidenceBand(w.confidence)}</div>
        </div>
        <ProvenanceTag provenance={w.endpointsConfirmed ? "USER_CONFIRMED" : "VISION_INFERRED"} />
        <button type="button" aria-label="Close" className="text-muted hover:text-fg" onClick={onClose}>
          ✕
        </button>
      </div>
      {w.evidenceNote ? <p className="text-sm text-muted">Evidence: {w.evidenceNote}</p> : null}
      {(["A", "B"] as const).map((side) => (
        <EndpointRow
          key={side}
          side={side}
          ep={side === "A" ? w.endpointA : w.endpointB}
          confirmed={side === "A" ? w.confirmedA : w.confirmedB}
          components={components}
          epText={epText}
          disabled={readOnly || saving || w.review === "rejected"}
          onSet={(componentKey, terminalLabel) => correct({ action: "set_endpoint", targetType: "connection", targetId: w.observationId, endpoint: side, componentKey, terminalLabel })}
          onUnknown={() => correct({ action: "mark_unknown", targetType: "connection", targetId: w.observationId, endpoint: side })}
        />
      ))}
      {!readOnly && w.review !== "rejected" && (
        <div className="flex gap-2">
          <Button variant="primary" disabled={saving || w.endpointsConfirmed} onClick={() => correct({ action: "accept", targetType: "connection", targetId: w.observationId })}>
            Confirm visible endpoints
          </Button>
          <Button variant="danger" disabled={saving} onClick={() => correct({ action: "reject", targetType: "connection", targetId: w.observationId })}>
            Dismiss
          </Button>
        </div>
      )}
      <HistoryList history={w.history} />
    </div>
  );
}

function EndpointRow({
  side,
  ep,
  confirmed,
  components,
  epText,
  disabled,
  onSet,
  onUnknown,
}: {
  side: "A" | "B";
  ep: Endpoint;
  confirmed: boolean;
  components: ReviewComponent[];
  epText: (e: Endpoint) => string;
  disabled: boolean;
  onSet: (componentKey: string, terminal: string) => void;
  onUnknown: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [comp, setComp] = useState(ep.componentKey || components[0]?.key || "");
  const [term, setTerm] = useState(ep.terminalLabel);
  return (
    <div className="rounded-lg border border-line p-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-mono text-xs text-muted">End {side}</span>
        <span className={`flex-1 font-mono text-xs ${ep.certainty === "unknown" ? "text-unknown" : ""}`}>{ep.certainty === "unknown" ? "Endpoint not clearly visible" : epText(ep)}</span>
        <span className="text-[11px] text-muted">{confirmed ? "● confirmed" : ep.certainty === "unknown" ? "?" : `◌ ${ep.certainty}`}</span>
        {!disabled && (
          <button type="button" className="text-xs text-accent hover:underline" onClick={() => setEditing((v) => !v)}>
            {editing ? "Cancel" : "Edit"}
          </button>
        )}
      </div>
      {editing && (
        <div className="mt-2 flex flex-wrap gap-2">
          <select aria-label={`End ${side} part`} value={comp} onChange={(e) => setComp(e.target.value)} className="min-w-0 flex-1 rounded border border-line bg-bg px-2 py-1 text-sm">
            {components.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <input aria-label={`End ${side} pin`} value={term} onChange={(e) => setTerm(e.target.value)} placeholder="GPIO18" className="w-24 rounded border border-line bg-bg px-2 py-1 font-mono text-sm" />
          <Button
            disabled={!comp || !term.trim()}
            onClick={() => {
              onSet(comp, term);
              setEditing(false);
            }}
          >
            Set
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              onUnknown();
              setEditing(false);
            }}
          >
            Unknown
          </Button>
        </div>
      )}
    </div>
  );
}

function AddForm({
  draft,
  components,
  saving,
  onCancel,
  onSave,
}: {
  draft: NonNullable<Draft>;
  components: ReviewComponent[];
  saving: boolean;
  onCancel: () => void;
  onSave: (c: Record<string, unknown>) => void;
}) {
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState("module");
  const [color, setColor] = useState("");
  const [a, setA] = useState({ comp: components[0]?.key ?? "", term: "" });
  const [b, setB] = useState({ comp: components[1]?.key ?? components[0]?.key ?? "", term: "" });
  const ep = (x: { comp: string; term: string }) =>
    x.comp && x.term.trim() ? { componentKey: x.comp, terminalLabel: x.term.trim(), certainty: "visible" } : { componentKey: "", terminalLabel: "", certainty: "unknown" };

  return (
    <Card className="grid gap-2 border-accent/60 p-3">
      <div className="text-sm font-medium">{draft.type === "component" ? "New part" : "New wire"}</div>
      {draft.type === "component" ? (
        <div className="flex flex-wrap gap-2">
          <input autoFocus aria-label="Part name" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="L9110S motor driver" className="min-w-0 flex-1 rounded border border-line bg-bg px-2 py-1 text-sm" />
          <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)} className="rounded border border-line bg-bg px-2 py-1 text-sm">
            <option value="board">board</option>
            <option value="module">module</option>
            <option value="component">component</option>
            <option value="breadboard">breadboard</option>
          </select>
        </div>
      ) : (
        <div className="grid gap-2">
          <input autoFocus aria-label="Wire colour" value={color} onChange={(e) => setColor(e.target.value)} placeholder="yellow" className="rounded border border-line bg-bg px-2 py-1 text-sm" />
          {([["A", a, setA], ["B", b, setB]] as const).map(([side, val, set]) => (
            <div key={side} className="flex gap-2">
              <span className="w-10 pt-1 font-mono text-xs text-muted">End {side}</span>
              <select aria-label={`End ${side} part`} value={val.comp} onChange={(e) => set({ ...val, comp: e.target.value })} className="min-w-0 flex-1 rounded border border-line bg-bg px-2 py-1 text-sm">
                {components.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input aria-label={`End ${side} pin`} value={val.term} onChange={(e) => set({ ...val, term: e.target.value })} placeholder="pin (blank = unknown)" className="w-36 rounded border border-line bg-bg px-2 py-1 font-mono text-sm" />
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={saving || (draft.type === "component" ? !label.trim() : components.length === 0)}
          onClick={() =>
            onSave(
              draft.type === "component"
                ? { action: "add", targetType: "component", kind, label: label.trim(), bbox: draft.bbox }
                : { action: "add", targetType: "connection", wireColor: color.trim(), endpointA: ep(a), endpointB: ep(b), bbox: draft.bbox },
            )
          }
        >
          Add
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

function HistoryList({ history }: { history: History[] }) {
  if (history.length === 0) return null;
  return (
    <details className="text-xs text-muted">
      <summary className="cursor-pointer">Correction history ({history.length})</summary>
      <ol className="mt-1 grid gap-0.5">
        {history.map((h) => (
          <li key={h.revision}>
            r{h.revision}: {h.summary}
          </li>
        ))}
      </ol>
    </details>
  );
}
