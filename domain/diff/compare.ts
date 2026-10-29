import type { BBox, EvidenceRef, GraphEdge, GraphNode, Provenance, SnapshotGraph, UnresolvedWire } from "../graph/types";

export const DIFF_ALGORITHM_VERSION = "diff-v1";

/** Component centre shift (fraction of image) above which we report MOVED. */
const MOVE_TOLERANCE = 0.06;
/** Geometry match: centres within this distance count as plausibly the same object. */
const MATCH_DISTANCE = 0.12;
/** A runner-up within this margin of the best geometric match makes the match ambiguous. */
const AMBIGUITY_MARGIN = 0.03;

export type DiffEventType = "added" | "removed" | "moved" | "connection_changed" | "attribute_changed" | "unresolved";

export type EdgeRef = { fromKey: string; toKey: string; fromLabel: string; toLabel: string; wireColor: string };
export type ComponentRef = { logicalKey: string; label: string; geometry?: BBox };

export type DiffEvent = {
  /** Deterministic key, stable for identical inputs. */
  key: string;
  type: DiffEventType;
  entityKind: "component" | "connection";
  description: string;
  baseline?: ComponentRef | EdgeRef;
  candidate?: ComponentRef | EdgeRef;
  /** Terminal keys involved (candidate key space), used by suspect ranking. */
  terminals: string[];
  /** Component labels involved, used by suspect ranking. */
  componentLabels: string[];
  evidence: { baseline: EvidenceRef[]; candidate: EvidenceRef[] };
  provenance: Provenance;
};

export type DiffResult = {
  algorithmVersion: string;
  events: DiffEvent[];
  matchedComponents: { baselineKey: string; candidateKey: string; method: "key" | "geometry" }[];
};

const centre = (b: BBox) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const dist = (a: BBox, b: BBox) => {
  const p = centre(a);
  const q = centre(b);
  return Math.hypot(p.x - q.x, p.y - q.y);
};
const weaker = (...p: Provenance[]): Provenance => (p.every((x) => x === "USER_CONFIRMED") ? "USER_CONFIRMED" : "VISION_INFERRED");

/**
 * Pure, order-independent comparison of two sealed snapshot graphs.
 * Ambiguity is reported as `unresolved` instead of being guessed away.
 */
export function compareSnapshots(baseline: SnapshotGraph, candidate: SnapshotGraph): DiffResult {
  const events: DiffEvent[] = [];
  const bParts = baseline.nodes.filter((n) => n.kind !== "terminal").sort(byKey);
  const cParts = candidate.nodes.filter((n) => n.kind !== "terminal").sort(byKey);
  const bTerminals = new Map(baseline.nodes.filter((n) => n.kind === "terminal").map((n) => [n.logicalKey, n]));
  const cTerminals = new Map(candidate.nodes.filter((n) => n.kind === "terminal").map((n) => [n.logicalKey, n]));

  // ---- 1. Component identity matching -------------------------------------
  const matches = new Map<string, { key: string; method: "key" | "geometry" }>(); // baseline → candidate
  const cTaken = new Set<string>();
  const cByKey = new Map(cParts.map((n) => [n.logicalKey, n]));
  for (const b of bParts) {
    const c = cByKey.get(b.logicalKey);
    if (c && c.kind === b.kind) {
      matches.set(b.logicalKey, { key: c.logicalKey, method: "key" });
      cTaken.add(c.logicalKey);
    }
  }
  const ambiguous = new Set<string>();
  for (const b of bParts) {
    if (matches.has(b.logicalKey) || !b.geometry) continue;
    const options = cParts
      .filter((c) => !cTaken.has(c.logicalKey) && c.kind === b.kind && c.geometry)
      .map((c) => ({ c, d: dist(b.geometry!, c.geometry!) }))
      .filter((o) => o.d <= MATCH_DISTANCE)
      .sort((x, y) => x.d - y.d || x.c.logicalKey.localeCompare(y.c.logicalKey));
    if (options.length === 0) continue;
    if (options.length > 1 && options[1].d - options[0].d < AMBIGUITY_MARGIN) {
      ambiguous.add(b.logicalKey);
      events.push({
        key: `unresolved:component:${b.logicalKey}`,
        type: "unresolved",
        entityKind: "component",
        description: `${b.label}: ${options.length} similar objects in the new checkpoint; identity unresolved.`,
        baseline: componentRef(b),
        terminals: [],
        componentLabels: [b.label, ...options.map((o) => o.c.label)],
        evidence: { baseline: b.evidence, candidate: options.flatMap((o) => o.c.evidence) },
        provenance: "VISION_INFERRED",
      });
      for (const o of options) cTaken.add(o.c.logicalKey);
      continue;
    }
    matches.set(b.logicalKey, { key: options[0].c.logicalKey, method: "geometry" });
    cTaken.add(options[0].c.logicalKey);
  }

  for (const b of bParts) {
    const m = matches.get(b.logicalKey);
    if (!m) {
      if (ambiguous.has(b.logicalKey)) continue;
      events.push({
        key: `removed:component:${b.logicalKey}`,
        type: "removed",
        entityKind: "component",
        description: `${b.label} is not visible in the new checkpoint. Removal unconfirmed (it may be occluded).`,
        baseline: componentRef(b),
        terminals: [],
        componentLabels: [b.label],
        evidence: { baseline: b.evidence, candidate: [] },
        provenance: b.provenance,
      });
      continue;
    }
    const c = cByKey.get(m.key)!;
    if (b.geometry && c.geometry && dist(b.geometry, c.geometry) > MOVE_TOLERANCE) {
      events.push({
        key: `moved:component:${b.logicalKey}`,
        type: "moved",
        entityKind: "component",
        description: `${c.label} appears in a different position.`,
        baseline: componentRef(b),
        candidate: componentRef(c),
        terminals: [],
        componentLabels: [c.label],
        evidence: { baseline: b.evidence, candidate: c.evidence },
        provenance: weaker(b.provenance, c.provenance),
      });
    }
    // Labels from two model runs often differ in wording; only a change between
    // two user-confirmed labels is a real attribute change.
    if (b.provenance === "USER_CONFIRMED" && c.provenance === "USER_CONFIRMED" && b.label.trim().toLowerCase() !== c.label.trim().toLowerCase()) {
      events.push({
        key: `attribute_changed:component:${b.logicalKey}`,
        type: "attribute_changed",
        entityKind: "component",
        description: `Confirmed label changed from "${b.label}" to "${c.label}".`,
        baseline: componentRef(b),
        candidate: componentRef(c),
        terminals: [],
        componentLabels: [b.label, c.label],
        evidence: { baseline: b.evidence, candidate: c.evidence },
        provenance: "USER_CONFIRMED",
      });
    }
  }
  const matchedCandidates = new Set([...matches.values()].map((m) => m.key));
  for (const c of cParts) {
    if (matchedCandidates.has(c.logicalKey) || cTaken.has(c.logicalKey)) continue;
    events.push({
      key: `added:component:${c.logicalKey}`,
      type: "added",
      entityKind: "component",
      description: `${c.label} appears in the new checkpoint.`,
      candidate: componentRef(c),
      terminals: [],
      componentLabels: [c.label],
      evidence: { baseline: [], candidate: c.evidence },
      provenance: c.provenance,
    });
  }

  // ---- 2. Connections, compared in the candidate key space ----------------
  const translate = (terminal: string): string | undefined => {
    const idx = terminal.lastIndexOf(":");
    const parent = terminal.slice(0, idx);
    const m = matches.get(parent);
    return m ? `${m.key}${terminal.slice(idx)}` : undefined;
  };
  const labelOf = (key: string, terminals: Map<string, GraphNode>, parts: GraphNode[]) => {
    const t = terminals.get(key);
    const parent = parts.find((p) => p.logicalKey === t?.parentKey);
    return `${parent?.label ?? key.split(":")[0]} ${t?.label ?? key.split(":").pop()}`;
  };
  const edgeRef = (e: GraphEdge, side: "b" | "c"): EdgeRef => ({
    fromKey: e.fromKey,
    toKey: e.toKey,
    fromLabel: labelOf(e.fromKey, side === "b" ? bTerminals : cTerminals, side === "b" ? bParts : cParts),
    toLabel: labelOf(e.toKey, side === "b" ? bTerminals : cTerminals, side === "b" ? bParts : cParts),
    wireColor: e.wireColor,
  });
  const partLabels = (keys: string[], parts: GraphNode[]) =>
    [...new Set(keys.map((k) => parts.find((p) => p.logicalKey === k.slice(0, k.lastIndexOf(":")))?.label).filter((x): x is string => !!x))];

  type Translated = { edge: GraphEdge; from?: string; to?: string; id: string };
  const bEdges: Translated[] = baseline.edges.map((e) => {
    const from = translate(e.fromKey);
    const to = translate(e.toKey);
    const [f, t] = from && to && from > to ? [to, from] : [from, to];
    return { edge: e, from: f, to: t, id: f && t ? `${f}|${t}` : `untranslatable:${e.fromKey}|${e.toKey}` };
  });
  const cEdgeIds = new Set(candidate.edges.map((e) => `${e.fromKey}|${e.toKey}`));
  const bEdgeIds = new Set(bEdges.map((e) => e.id));
  const bOnly = bEdges.filter((e) => !cEdgeIds.has(e.id)).sort((x, y) => x.id.localeCompare(y.id));
  const cOnly = candidate.edges.filter((e) => !bEdgeIds.has(`${e.fromKey}|${e.toKey}`)).sort((x, y) => `${x.fromKey}|${x.toKey}`.localeCompare(`${y.fromKey}|${y.toKey}`));

  // Pair a removed + added edge as one CONNECTION_CHANGED only when they share an
  // endpoint AND colour, and the pairing is unique in both directions.
  const sameColor = (a: string, b: string) => !a || !b || a === b;
  const partners = (b: Translated) =>
    cOnly.filter((c) => sameColor(b.edge.wireColor, c.wireColor) && [b.from, b.to].filter(Boolean).some((k) => k === c.fromKey || k === c.toKey));
  const usedC = new Set<GraphEdge>();
  const usedB = new Set<Translated>();
  for (const b of bOnly) {
    const ps = partners(b);
    if (ps.length === 0) continue;
    const reverse = ps.length === 1 ? bOnly.filter((other) => partners(other).includes(ps[0])) : [];
    if (ps.length === 1 && reverse.length === 1) {
      const c = ps[0];
      const shared = [b.from, b.to].find((k) => k === c.fromKey || k === c.toKey)!;
      const oldEnd = b.from === shared ? b.to : b.from;
      const newEnd = c.fromKey === shared ? c.toKey : c.fromKey;
      const bRef = edgeRef(b.edge, "b");
      const cRef = edgeRef(c, "c");
      // The old endpoint only exists as a terminal in the baseline graph.
      const oldEndBaselineKey = translate(b.edge.fromKey) === oldEnd ? b.edge.fromKey : b.edge.toKey;
      events.push({
        key: `connection_changed:${shared}:${oldEnd}->${newEnd}`,
        type: "connection_changed",
        entityKind: "connection",
        description: `${capitalize(c.wireColor || "wire")} jumper at ${labelOf(shared, cTerminals, cParts)} moved from ${labelOf(
          oldEndBaselineKey,
          bTerminals,
          bParts,
        )} to ${labelOf(newEnd, cTerminals, cParts)}.`,
        baseline: bRef,
        candidate: cRef,
        terminals: [shared, oldEnd ?? "", newEnd].filter(Boolean),
        componentLabels: partLabels([c.fromKey, c.toKey], cParts),
        evidence: { baseline: b.edge.evidence, candidate: c.evidence },
        provenance: weaker(b.edge.provenance, c.provenance),
      });
      usedB.add(b);
      usedC.add(c);
    } else {
      events.push({
        key: `unresolved:connection:${b.id}`,
        type: "unresolved",
        entityKind: "connection",
        description: `${b.edge.wireColor || "A"} wire changed, but ${ps.length > 1 ? `${ps.length} similar wires` : "another similar wire"} could explain it; wire identity unresolved.`,
        baseline: edgeRef(b.edge, "b"),
        terminals: [b.from, b.to].filter((x): x is string => !!x),
        componentLabels: partLabels([b.edge.fromKey, b.edge.toKey], bParts),
        evidence: { baseline: b.edge.evidence, candidate: ps.flatMap((p) => p.evidence) },
        provenance: "VISION_INFERRED",
      });
      usedB.add(b);
      for (const p of ps) usedC.add(p);
    }
  }

  // An edge that vanished but whose wire is now only partly visible is
  // "unresolved", not "removed".
  const explainingUnresolved = (b: Translated): UnresolvedWire | undefined =>
    candidate.unresolved.find(
      (u) => sameColor(b.edge.wireColor, u.wireColor.toLowerCase()) && (!u.knownEndpointKey || u.knownEndpointKey === b.from || u.knownEndpointKey === b.to),
    );
  const usedUnresolved = new Set<UnresolvedWire>();
  for (const b of bOnly) {
    if (usedB.has(b)) continue;
    const u = explainingUnresolved(b);
    if (u) {
      usedUnresolved.add(u);
      events.push({
        key: `unresolved:connection:${b.id}`,
        type: "unresolved",
        entityKind: "connection",
        description: `${b.edge.wireColor || "Wire"} jumper ${edgeRef(b.edge, "b").fromLabel} – ${edgeRef(b.edge, "b").toLabel}: an endpoint is not clearly visible in the new checkpoint.`,
        baseline: edgeRef(b.edge, "b"),
        terminals: [b.from, b.to].filter((x): x is string => !!x),
        componentLabels: partLabels([b.edge.fromKey, b.edge.toKey], bParts),
        evidence: { baseline: b.edge.evidence, candidate: u.evidence },
        provenance: "VISION_INFERRED",
      });
      continue;
    }
    const ref = edgeRef(b.edge, "b");
    events.push({
      key: `removed:connection:${b.id}`,
      type: "removed",
      entityKind: "connection",
      description: `${b.edge.wireColor || "Wire"} jumper ${ref.fromLabel} – ${ref.toLabel} is not visible in the new checkpoint.`,
      baseline: ref,
      terminals: [b.from, b.to].filter((x): x is string => !!x),
      componentLabels: partLabels([b.edge.fromKey, b.edge.toKey], bParts),
      evidence: { baseline: b.edge.evidence, candidate: [] },
      provenance: b.edge.provenance,
    });
  }
  for (const c of cOnly) {
    if (usedC.has(c)) continue;
    const ref = edgeRef(c, "c");
    events.push({
      key: `added:connection:${c.fromKey}|${c.toKey}`,
      type: "added",
      entityKind: "connection",
      description: `${c.wireColor || "Wire"} jumper ${ref.fromLabel} – ${ref.toLabel} appears in the new checkpoint.`,
      candidate: ref,
      terminals: [c.fromKey, c.toKey],
      componentLabels: partLabels([c.fromKey, c.toKey], cParts),
      evidence: { baseline: [], candidate: c.evidence },
      provenance: c.provenance,
    });
  }
  // New unknown endpoints that do not correspond to anything already unresolved in the baseline.
  for (const u of candidate.unresolved) {
    if (usedUnresolved.has(u)) continue;
    const seenBefore = baseline.unresolved.some(
      (bu) => bu.wireColor.toLowerCase() === u.wireColor.toLowerCase() && translate(bu.knownEndpointKey ?? "x:x") === u.knownEndpointKey,
    );
    if (seenBefore) continue;
    events.push({
      key: `unresolved:connection:candidate:${u.observationKey}`,
      type: "unresolved",
      entityKind: "connection",
      description: `${u.wireColor || "A"} wire in the new checkpoint has an endpoint that is not clearly visible.`,
      terminals: u.knownEndpointKey ? [u.knownEndpointKey] : [],
      componentLabels: u.knownEndpointKey ? partLabels([u.knownEndpointKey], cParts) : [],
      evidence: { baseline: [], candidate: u.evidence },
      provenance: "VISION_INFERRED",
    });
  }

  events.sort((a, b) => a.key.localeCompare(b.key));
  return {
    algorithmVersion: DIFF_ALGORITHM_VERSION,
    events,
    matchedComponents: [...matches.entries()]
      .map(([baselineKey, m]) => ({ baselineKey, candidateKey: m.key, method: m.method }))
      .sort((a, b) => a.baselineKey.localeCompare(b.baselineKey)),
  };
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function byKey(a: GraphNode, b: GraphNode) {
  return a.logicalKey.localeCompare(b.logicalKey);
}

function componentRef(n: GraphNode): ComponentRef {
  return { logicalKey: n.logicalKey, label: n.label, geometry: n.geometry };
}
