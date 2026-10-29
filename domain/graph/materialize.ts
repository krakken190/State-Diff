import { slug, terminalKey, type BBox, type EvidenceRef, type GraphEdge, type GraphNode, type Provenance, type SnapshotGraph, type UnresolvedWire } from "./types";

export const MATERIALIZER_VERSION = "materialize-v1";

export type ReviewState = "pending" | "accepted" | "rejected" | "corrected";

/** A component observation after its corrections have been applied. */
export type EffectiveComponent = {
  observationId: string;
  key: string;
  kind: string;
  label: string;
  bbox: BBox;
  confidence: number | null;
  review: ReviewState;
  evidence: EvidenceRef;
};

export type EffectiveEndpoint = { componentKey: string; terminalLabel: string; certainty: "visible" | "inferred" | "unknown" };

export type EffectiveConnection = {
  observationId: string;
  key: string;
  wireColor: string;
  endpointA: EffectiveEndpoint;
  endpointB: EffectiveEndpoint;
  confidence: number | null;
  review: ReviewState;
  /** True when the user set or confirmed both endpoints. */
  endpointsConfirmed: boolean;
  evidence: EvidenceRef;
};

const BOARD_KINDS = new Set(["board", "module", "breadboard"]);

/**
 * Deterministically builds a snapshot graph from reviewed observations.
 * Rejected observations are dropped; wires with an unknown endpoint are kept
 * as unresolved records instead of being forced into edges.
 */
export function materializeSnapshot(
  components: readonly EffectiveComponent[],
  connections: readonly EffectiveConnection[],
): SnapshotGraph {
  const nodes = new Map<string, GraphNode>();
  const logicalByObsKey = new Map<string, string>();

  const sortedComponents = [...components]
    .filter((c) => c.review !== "rejected")
    .sort((a, b) => a.key.localeCompare(b.key));

  for (const c of sortedComponents) {
    // Breadboards carry no labelled terminals in this model; keep them as context nodes.
    let logicalKey = slug(c.label);
    // Two observations with the same label in one image stay distinct; identity
    // across checkpoints is resolved later by the matcher, not by suffix order.
    if (nodes.has(logicalKey)) logicalKey = `${logicalKey}#${slug(c.key)}`;
    logicalByObsKey.set(c.key, logicalKey);
    nodes.set(logicalKey, {
      logicalKey,
      kind: BOARD_KINDS.has(c.kind) ? "board" : "component",
      label: c.label,
      geometry: c.bbox,
      provenance: c.review === "accepted" || c.review === "corrected" ? "USER_CONFIRMED" : "VISION_INFERRED",
      evidence: [c.evidence],
      confidence: c.confidence,
    });
  }

  const edges = new Map<string, GraphEdge>();
  const unresolved: UnresolvedWire[] = [];

  const resolveEndpoint = (ep: EffectiveEndpoint): string | undefined => {
    if (ep.certainty === "unknown" || !ep.terminalLabel.trim()) return undefined;
    const parent = logicalByObsKey.get(ep.componentKey);
    return parent ? terminalKey(parent, ep.terminalLabel) : undefined;
  };

  const ensureTerminal = (key: string, parentKey: string, label: string, provenance: Provenance, evidence: EvidenceRef) => {
    const existing = nodes.get(key);
    if (existing) {
      if (provenance === "USER_CONFIRMED") existing.provenance = "USER_CONFIRMED";
      existing.evidence.push(evidence);
      return;
    }
    nodes.set(key, { logicalKey: key, kind: "terminal", label, parentKey, provenance, evidence: [evidence], confidence: null });
  };

  for (const conn of [...connections].filter((c) => c.review !== "rejected").sort((a, b) => a.key.localeCompare(b.key))) {
    const a = resolveEndpoint(conn.endpointA);
    const b = resolveEndpoint(conn.endpointB);
    if (!a || !b || a === b) {
      unresolved.push({
        observationKey: conn.key,
        wireColor: conn.wireColor,
        knownEndpointKey: a ?? b,
        reason: a === b && a ? "both endpoints resolve to the same terminal" : "endpoint not clearly visible",
        evidence: [conn.evidence],
      });
      continue;
    }
    const provenance: Provenance = conn.endpointsConfirmed ? "USER_CONFIRMED" : "VISION_INFERRED";
    ensureTerminal(a, logicalByObsKey.get(conn.endpointA.componentKey)!, conn.endpointA.terminalLabel, provenance, conn.evidence);
    ensureTerminal(b, logicalByObsKey.get(conn.endpointB.componentKey)!, conn.endpointB.terminalLabel, provenance, conn.evidence);
    const [fromKey, toKey] = a < b ? [a, b] : [b, a];
    const edgeKey = `${fromKey}|${toKey}`;
    const existing = edges.get(edgeKey);
    if (existing) {
      existing.evidence.push(conn.evidence);
      if (provenance === "USER_CONFIRMED") existing.provenance = "USER_CONFIRMED";
      continue;
    }
    edges.set(edgeKey, { fromKey, toKey, wireColor: conn.wireColor.toLowerCase(), provenance, evidence: [conn.evidence], confidence: conn.confidence });
  }

  return {
    nodes: [...nodes.values()].sort((x, y) => x.logicalKey.localeCompare(y.logicalKey)),
    edges: [...edges.values()].sort((x, y) => `${x.fromKey}|${x.toKey}`.localeCompare(`${y.fromKey}|${y.toKey}`)),
    unresolved: unresolved.sort((x, y) => x.observationKey.localeCompare(y.observationKey)),
  };
}
