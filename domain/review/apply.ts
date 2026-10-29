import type { EffectiveComponent, EffectiveConnection, EffectiveEndpoint, ReviewState } from "../graph/materialize";
import type { BBox } from "../graph/types";

export type ComponentObservation = {
  id: string;
  key: string;
  kind: string;
  label: string;
  bbox: BBox;
  confidence: number | null;
  evidenceNote: string;
  captureId: string;
};

export type ConnectionObservation = {
  id: string;
  key: string;
  wireColor: string;
  endpointA: EffectiveEndpoint;
  endpointB: EffectiveEndpoint;
  bbox: BBox;
  confidence: number | null;
  evidenceNote: string;
  captureId: string;
};

export type CorrectionAction = "accept" | "reject" | "relabel" | "set_endpoint" | "mark_unknown" | "add";

export type Correction = {
  revision: number;
  targetType: "component" | "connection";
  targetId: string;
  action: CorrectionAction;
  after: unknown;
  createdAt: string;
};

export type HistoryEntry = { revision: number; action: CorrectionAction; summary: string; createdAt: string };

export type ReviewComponent = EffectiveComponent & {
  source: "vision" | "manual";
  original?: { label: string; kind: string };
  evidenceNote: string;
  history: HistoryEntry[];
};

export type ReviewConnection = EffectiveConnection & {
  source: "vision" | "manual";
  original?: { endpointA: EffectiveEndpoint; endpointB: EffectiveEndpoint };
  confirmedA: boolean;
  confirmedB: boolean;
  bbox: BBox;
  evidenceNote: string;
  history: HistoryEntry[];
};

type ManualComponent = { kind: string; label: string; bbox: BBox };
type ManualConnection = { wireColor: string; endpointA: EffectiveEndpoint; endpointB: EffectiveEndpoint; bbox: BBox };

/**
 * Folds the append-only correction log over immutable model observations.
 * Original values stay available (`original`), and nothing becomes
 * user-confirmed unless a correction explicitly says so.
 */
export function applyCorrections(
  checkpointId: string,
  components: readonly ComponentObservation[],
  connections: readonly ConnectionObservation[],
  corrections: readonly Correction[],
  defaultCaptureId: string,
): { components: ReviewComponent[]; connections: ReviewConnection[] } {
  const comps = new Map<string, ReviewComponent>();
  const conns = new Map<string, ReviewConnection>();

  for (const c of components) {
    comps.set(c.id, {
      observationId: c.id,
      key: c.key,
      kind: c.kind,
      label: c.label,
      bbox: c.bbox,
      confidence: c.confidence,
      review: "pending",
      evidence: { checkpointId, captureId: c.captureId, observationId: c.id, bbox: c.bbox },
      source: "vision",
      original: { label: c.label, kind: c.kind },
      evidenceNote: c.evidenceNote,
      history: [],
    });
  }
  for (const c of connections) {
    conns.set(c.id, {
      observationId: c.id,
      key: c.key,
      wireColor: c.wireColor,
      endpointA: c.endpointA,
      endpointB: c.endpointB,
      confidence: c.confidence,
      review: "pending",
      endpointsConfirmed: false,
      evidence: { checkpointId, captureId: c.captureId, observationId: c.id, bbox: c.bbox },
      source: "vision",
      original: { endpointA: c.endpointA, endpointB: c.endpointB },
      confirmedA: false,
      confirmedB: false,
      bbox: c.bbox,
      evidenceNote: c.evidenceNote,
      history: [],
    });
  }

  const corrected = (prev: ReviewState): ReviewState => (prev === "rejected" ? "rejected" : "corrected");

  for (const corr of [...corrections].sort((a, b) => a.revision - b.revision)) {
    const entry = (summary: string): HistoryEntry => ({ revision: corr.revision, action: corr.action, summary, createdAt: corr.createdAt });
    if (corr.targetType === "component") {
      if (corr.action === "add") {
        const m = corr.after as ManualComponent;
        comps.set(corr.targetId, {
          observationId: corr.targetId,
          key: `manual-${corr.targetId.slice(0, 8)}`,
          kind: m.kind,
          label: m.label,
          bbox: m.bbox,
          confidence: null,
          review: "accepted",
          evidence: { checkpointId, captureId: defaultCaptureId, observationId: corr.targetId, bbox: m.bbox },
          source: "manual",
          evidenceNote: "Added by you",
          history: [entry(`Added "${m.label}"`)],
        });
        continue;
      }
      const c = comps.get(corr.targetId);
      if (!c) continue;
      if (corr.action === "accept") {
        c.review = "accepted";
        c.history.push(entry("Confirmed"));
      } else if (corr.action === "reject") {
        c.review = "rejected";
        c.history.push(entry("Dismissed as false positive"));
      } else if (corr.action === "relabel") {
        const a = corr.after as { label: string; kind?: string };
        c.history.push(entry(`Renamed "${c.label}" → "${a.label}"`));
        c.label = a.label;
        if (a.kind) c.kind = a.kind;
        c.review = corrected(c.review);
      }
      continue;
    }

    if (corr.action === "add") {
      const m = corr.after as ManualConnection;
      conns.set(corr.targetId, {
        observationId: corr.targetId,
        key: `manual-${corr.targetId.slice(0, 8)}`,
        wireColor: m.wireColor.toLowerCase(),
        endpointA: m.endpointA,
        endpointB: m.endpointB,
        confidence: null,
        review: "accepted",
        endpointsConfirmed: m.endpointA.certainty !== "unknown" && m.endpointB.certainty !== "unknown",
        evidence: { checkpointId, captureId: defaultCaptureId, observationId: corr.targetId, bbox: m.bbox },
        source: "manual",
        confirmedA: m.endpointA.certainty !== "unknown",
        confirmedB: m.endpointB.certainty !== "unknown",
        bbox: m.bbox,
        evidenceNote: "Added by you",
        history: [entry(`Added ${m.wireColor} wire`)],
      });
      continue;
    }
    const w = conns.get(corr.targetId);
    if (!w) continue;
    if (corr.action === "accept") {
      w.review = "accepted";
      w.confirmedA = w.endpointA.certainty !== "unknown";
      w.confirmedB = w.endpointB.certainty !== "unknown";
      w.history.push(entry("Confirmed visible endpoints"));
    } else if (corr.action === "reject") {
      w.review = "rejected";
      w.history.push(entry("Dismissed as false positive"));
    } else if (corr.action === "set_endpoint" || corr.action === "mark_unknown") {
      const a = corr.after as { endpoint: "A" | "B"; componentKey?: string; terminalLabel?: string };
      const next: EffectiveEndpoint =
        corr.action === "mark_unknown"
          ? { componentKey: "", terminalLabel: "", certainty: "unknown" }
          : { componentKey: a.componentKey ?? "", terminalLabel: (a.terminalLabel ?? "").trim(), certainty: "visible" };
      if (a.endpoint === "A") {
        w.endpointA = next;
        w.confirmedA = corr.action === "set_endpoint";
      } else {
        w.endpointB = next;
        w.confirmedB = corr.action === "set_endpoint";
      }
      w.history.push(entry(corr.action === "mark_unknown" ? `Endpoint ${a.endpoint} marked unknown` : `Endpoint ${a.endpoint} set to ${next.terminalLabel}`));
      w.review = corrected(w.review);
    }
    w.endpointsConfirmed = w.confirmedA && w.confirmedB;
  }

  return {
    components: [...comps.values()].sort((a, b) => a.key.localeCompare(b.key)),
    connections: [...conns.values()].sort((a, b) => a.key.localeCompare(b.key)),
  };
}
