import "server-only";
import { materializeSnapshot, MATERIALIZER_VERSION } from "@/domain/graph/materialize";
import type { GraphEdge, GraphNode, SnapshotGraph, UnresolvedWire } from "@/domain/graph/types";
import { AppError } from "@/lib/api";
import { db, newId, now, parseJson, transaction } from "@/lib/db";
import { audit, getCheckpoint } from "./projects";
import { reviewState } from "./review";

/**
 * Seals a checkpoint: materializes the reviewed observations into an
 * immutable snapshot graph inside one IMMEDIATE transaction, so concurrent
 * seal requests serialize instead of creating duplicate versions.
 */
export function sealCheckpoint(checkpointId: string) {
  const state = reviewState(checkpointId);
  const cp = state.checkpoint;
  if (cp.status === "sealed") return { snapshotId: cp.active_snapshot_id!, alreadySealed: true };
  if (cp.status !== "needs_review") throw new AppError("SNAPSHOT_NOT_READY", "Analyze and review the photo before sealing.");
  if (!state.components.some((c) => c.review !== "rejected")) {
    throw new AppError("VALIDATION_FAILED", "Nothing to seal: keep or add at least one component.");
  }
  const graph = materializeSnapshot(state.components, state.connections);

  const snapshotId = transaction(db(), () => {
    const fresh = getCheckpoint(checkpointId);
    if (fresh.status === "sealed") return fresh.active_snapshot_id!;
    const version = (db().prepare("select coalesce(max(version), 0) + 1 as v from snapshots where checkpoint_id = ?").get(cp.id) as { v: number }).v;
    const id = newId();
    const t = now();
    db().prepare(
      `insert into snapshots (id, project_id, checkpoint_id, version, source_analysis_run_id, correction_revision, materializer_version, unresolved_json, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, cp.project_id, cp.id, version, state.analysisRunId, state.revision, MATERIALIZER_VERSION, JSON.stringify(graph.unresolved), t);

    const nodeIds = new Map<string, string>();
    // Parents before terminals so parent_node_id can reference them.
    for (const n of [...graph.nodes].sort((a, b) => Number(a.kind === "terminal") - Number(b.kind === "terminal"))) {
      const nid = newId();
      nodeIds.set(n.logicalKey, nid);
      db().prepare(
        `insert into snapshot_nodes (id, project_id, snapshot_id, logical_key, kind, label, parent_node_id, geometry_json, provenance, evidence_json, confidence)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(nid, cp.project_id, id, n.logicalKey, n.kind, n.label, n.parentKey ? nodeIds.get(n.parentKey) ?? null : null,
        n.geometry ? JSON.stringify(n.geometry) : null, n.provenance, JSON.stringify(n.evidence), n.confidence);
    }
    for (const e of graph.edges) {
      const a = nodeIds.get(e.fromKey)!;
      const b = nodeIds.get(e.toKey)!;
      const [from, to] = a < b ? [a, b] : [b, a];
      db().prepare(
        `insert into snapshot_edges (id, project_id, snapshot_id, from_node_id, to_node_id, wire_color, provenance, evidence_json, confidence)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(newId(), cp.project_id, id, from, to, e.wireColor, e.provenance, JSON.stringify(e.evidence), e.confidence);
    }
    db().prepare("update checkpoints set status = 'sealed', sealed_at = ?, active_snapshot_id = ? where id = ?").run(t, id, cp.id);
    return id;
  });
  audit(cp.project_id, "checkpoint.sealed", "snapshot", snapshotId, { nodes: graph.nodes.length, edges: graph.edges.length, unresolved: graph.unresolved.length });
  return { snapshotId, alreadySealed: false };
}

type NodeRow = { id: string; logical_key: string; kind: GraphNode["kind"]; label: string; parent_node_id: string | null; geometry_json: string | null; provenance: GraphNode["provenance"]; evidence_json: string; confidence: number | null };
type EdgeRow = { from_node_id: string; to_node_id: string; wire_color: string; provenance: GraphEdge["provenance"]; evidence_json: string; confidence: number | null };

export function loadGraph(snapshotId: string): SnapshotGraph {
  const snap = db().prepare("select unresolved_json from snapshots where id = ?").get(snapshotId) as { unresolved_json: string } | undefined;
  if (!snap) throw new AppError("NOT_FOUND", "Snapshot not found.");
  const rows = db().prepare("select * from snapshot_nodes where snapshot_id = ?").all(snapshotId) as NodeRow[];
  const keyById = new Map(rows.map((r) => [r.id, r.logical_key]));
  const nodes: GraphNode[] = rows.map((r) => ({
    logicalKey: r.logical_key,
    kind: r.kind,
    label: r.label,
    parentKey: r.parent_node_id ? keyById.get(r.parent_node_id) : undefined,
    geometry: r.geometry_json ? JSON.parse(r.geometry_json) : undefined,
    provenance: r.provenance,
    evidence: JSON.parse(r.evidence_json),
    confidence: r.confidence,
  }));
  const edges: GraphEdge[] = (db().prepare("select * from snapshot_edges where snapshot_id = ?").all(snapshotId) as EdgeRow[]).map((r) => {
    const [fromKey, toKey] = [keyById.get(r.from_node_id)!, keyById.get(r.to_node_id)!].sort();
    return { fromKey, toKey, wireColor: r.wire_color, provenance: r.provenance, evidence: JSON.parse(r.evidence_json), confidence: r.confidence };
  });
  return { nodes, edges, unresolved: parseJson<UnresolvedWire[]>(snap.unresolved_json, []) };
}
