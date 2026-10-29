export type Provenance = "VISION_INFERRED" | "USER_CONFIRMED";

export type BBox = { x: number; y: number; w: number; h: number };

/** Points at a stored observation (and the image region it came from). */
export type EvidenceRef = {
  checkpointId: string;
  captureId: string;
  observationId: string;
  bbox?: BBox;
};

export type GraphNode = {
  logicalKey: string;
  kind: "board" | "component" | "terminal";
  label: string;
  parentKey?: string;
  geometry?: BBox;
  provenance: Provenance;
  evidence: EvidenceRef[];
  confidence: number | null;
};

export type GraphEdge = {
  /** Canonical: fromKey < toKey (terminal logical keys). */
  fromKey: string;
  toKey: string;
  wireColor: string;
  provenance: Provenance;
  evidence: EvidenceRef[];
  confidence: number | null;
};

/** A wire whose endpoints could not both be resolved; never becomes an edge. */
export type UnresolvedWire = {
  observationKey: string;
  wireColor: string;
  knownEndpointKey?: string;
  reason: string;
  evidence: EvidenceRef[];
};

export type SnapshotGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  unresolved: UnresolvedWire[];
};

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "unnamed";

/** "gpio 18", "GPIO-18", "io18" → "GPIO18"; other labels upper-cased with spaces removed. */
export function normalizePin(label: string): string {
  const t = label.trim().toUpperCase().replace(/[\s_-]+/g, "");
  const gpio = t.match(/^(?:GPIO|IO|G|D)(\d{1,2})$/);
  if (gpio) return `GPIO${Number(gpio[1])}`;
  if (t === "3.3V" || t === "3V3" || t === "3.3") return "3V3";
  if (t === "5V" || t === "VIN") return t;
  return t;
}

export const terminalKey = (componentKey: string, pin: string) => `${componentKey}:${normalizePin(pin)}`;
