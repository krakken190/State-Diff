import "server-only";
import { compareSnapshots, DIFF_ALGORITHM_VERSION, type DiffEvent } from "@/domain/diff/compare";
import { parsePinMap, rankSuspects, RANKING_VERSION, type CodeChange, type TestStatus, type TestTransition } from "@/domain/investigation/rank";
import { AppError } from "@/lib/api";
import { db, newId, now, parseJson, transaction } from "@/lib/db";
import { audit, capturesFor, getCheckpoint, getProject, latestGit, latestTests, type CheckpointRow } from "./projects";
import { loadGraph } from "./snapshots";

/**
 * Compares two sealed checkpoints, pinning their exact snapshot versions, and
 * stores the deterministic diff events and ranked suspects. Later
 * corrections create new snapshots and never alter an existing comparison.
 */
export function createComparison(baselineCheckpointId: string, candidateCheckpointId: string) {
  if (baselineCheckpointId === candidateCheckpointId) throw new AppError("VALIDATION_FAILED", "Pick two different checkpoints.");
  const base = getCheckpoint(baselineCheckpointId);
  const cand = getCheckpoint(candidateCheckpointId);
  if (base.project_id !== cand.project_id) throw new AppError("VALIDATION_FAILED", "Checkpoints belong to different projects.");
  if (base.rig_id !== cand.rig_id) throw new AppError("VALIDATION_FAILED", "Checkpoints belong to different rigs.");
  if (!base.active_snapshot_id || !cand.active_snapshot_id) throw new AppError("SNAPSHOT_NOT_READY", "Review and seal both checkpoints before comparing.");

  const existing = db()
    .prepare("select id from comparisons where baseline_snapshot_id = ? and candidate_snapshot_id = ? and algorithm_version = ? order by created_at desc limit 1")
    .get(base.active_snapshot_id, cand.active_snapshot_id, DIFF_ALGORITHM_VERSION) as { id: string } | undefined;
  if (existing) return existing.id;

  const diff = compareSnapshots(loadGraph(base.active_snapshot_id), loadGraph(cand.active_snapshot_id));
  const transitions = testTransitions(base.id, cand.id);
  const codeChanges = codeChangesBetween(base, cand);
  const project = getProject(base.project_id);
  const suspects = rankSuspects({ events: diff.events, transitions, codeChanges, pinMap: parsePinMap(project.hardware_context) });

  const id = newId();
  transaction(db(), () => {
    const t = now();
    const counts: Record<string, number> = {};
    for (const e of diff.events) counts[e.type] = (counts[e.type] ?? 0) + 1;
    db().prepare(
      `insert into comparisons (id, project_id, baseline_checkpoint_id, candidate_checkpoint_id, baseline_snapshot_id, candidate_snapshot_id, algorithm_version, status, summary_json, created_at)
       values (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)`,
    ).run(id, base.project_id, base.id, cand.id, base.active_snapshot_id, cand.active_snapshot_id, DIFF_ALGORITHM_VERSION,
      JSON.stringify({ counts, rankingVersion: RANKING_VERSION, matchedComponents: diff.matchedComponents, transitions, codeChanges: codeChanges.map((c) => c.path) }), t);
    const eventIds = new Map<string, string>();
    for (const e of diff.events) {
      const eid = newId();
      eventIds.set(e.key, eid);
      db().prepare(
        `insert into diff_events (id, project_id, comparison_id, event_key, event_type, entity_kind, description, baseline_ref_json, candidate_ref_json, evidence_json, provenance, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(eid, base.project_id, id, e.key, e.type, e.entityKind, e.description, e.baseline ? JSON.stringify(e.baseline) : null,
        e.candidate ? JSON.stringify(e.candidate) : null, JSON.stringify({ ...e.evidence, terminals: e.terminals, componentLabels: e.componentLabels }), e.provenance, t);
    }
    suspects.forEach((s, i) => {
      // Findings cite stored diff-event ids (physical) or the Git file path (code) — never free text.
      const evidence = s.kind === "physical" ? { diffEventIds: s.evidenceKeys.map((k) => eventIds.get(k)!), relatedTests: s.relatedTests } : { files: s.evidenceKeys, relatedTests: s.relatedTests };
      db().prepare(
        `insert into findings (id, project_id, comparison_id, rank, kind, title, explanation, suggested_check, score, score_breakdown_json, uncertainty, evidence_json, explanation_source, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'template', ?)`,
      ).run(newId(), base.project_id, id, i + 1, s.kind, s.title, s.explanation, s.suggestedCheck, s.score, JSON.stringify(s.breakdown), s.uncertainty, JSON.stringify(evidence), t);
    });
  });
  audit(base.project_id, "comparison.created", "comparison", id, { events: diff.events.length, suspects: suspects.length });
  return id;
}

export function testTransitions(baselineId: string, candidateId: string): TestTransition[] {
  const before = new Map(latestTests(baselineId).map((t) => [t.name, t.status as TestStatus]));
  const after = new Map(latestTests(candidateId).map((t) => [t.name, t.status as TestStatus]));
  return [...new Set([...before.keys(), ...after.keys()])].sort().map((name) => ({ name, before: before.get(name) ?? "unknown", after: after.get(name) ?? "unknown" }));
}

/** Code changes recorded on every checkpoint after the baseline up to and including the candidate. */
function codeChangesBetween(base: CheckpointRow, cand: CheckpointRow): CodeChange[] {
  const between = db()
    .prepare("select id from checkpoints where project_id = ? and rig_id = ? and created_at > ? and created_at <= ? order by created_at")
    .all(base.project_id, base.rig_id, base.created_at, cand.created_at) as { id: string }[];
  const byPath = new Map<string, CodeChange>();
  for (const { id } of between) {
    for (const f of latestGit(id)?.changedFiles ?? []) {
      const prev = byPath.get(f.path);
      byPath.set(f.path, { path: f.path, changedLines: [...(prev?.changedLines ?? []), ...f.changedLines].slice(0, 40) });
    }
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

type DiffEventRow = { id: string; event_key: string; event_type: DiffEvent["type"]; entity_kind: DiffEvent["entityKind"]; description: string; baseline_ref_json: string | null; candidate_ref_json: string | null; evidence_json: string; provenance: DiffEvent["provenance"] };
type FindingRow = { id: string; rank: number; kind: "physical" | "code"; title: string; explanation: string; suggested_check: string; score: number; score_breakdown_json: string; uncertainty: "low" | "medium" | "high"; evidence_json: string; explanation_source: string; explanation_model: string | null; user_outcome: string | null };

export function getComparison(id: string) {
  const row = db().prepare("select * from comparisons where id = ?").get(id) as
    | { id: string; project_id: string; baseline_checkpoint_id: string; candidate_checkpoint_id: string; baseline_snapshot_id: string; candidate_snapshot_id: string; algorithm_version: string; summary_json: string; created_at: string }
    | undefined;
  if (!row) throw new AppError("NOT_FOUND", "Comparison not found.");
  getProject(row.project_id);
  const side = (checkpointId: string) => {
    const cp = getCheckpoint(checkpointId);
    const capture = capturesFor(cp.id)[0];
    return { checkpoint: cp, captureId: capture?.id ?? null, tests: latestTests(cp.id), git: latestGit(cp.id) };
  };
  const events = (db().prepare("select * from diff_events where comparison_id = ? order by event_key").all(id) as DiffEventRow[]).map((e) => ({
    id: e.id,
    key: e.event_key,
    type: e.event_type,
    entityKind: e.entity_kind,
    description: e.description,
    baseline: parseJson(e.baseline_ref_json, null),
    candidate: parseJson(e.candidate_ref_json, null),
    evidence: parseJson<{ baseline: { bbox?: object; observationId: string }[]; candidate: { bbox?: object; observationId: string }[] }>(e.evidence_json, { baseline: [], candidate: [] }),
    provenance: e.provenance,
  }));
  const findings = (db().prepare("select * from findings where comparison_id = ? order by rank").all(id) as FindingRow[]).map((f) => ({
    id: f.id,
    rank: f.rank,
    kind: f.kind,
    title: f.title,
    explanation: f.explanation,
    suggestedCheck: f.suggested_check,
    score: f.score,
    breakdown: parseJson(f.score_breakdown_json, {}),
    uncertainty: f.uncertainty,
    evidence: parseJson<{ diffEventIds?: string[]; files?: string[]; relatedTests: string[] }>(f.evidence_json, { relatedTests: [] }),
    explanationSource: f.explanation_source,
    explanationModel: f.explanation_model,
    userOutcome: f.user_outcome,
  }));
  return {
    id: row.id,
    projectId: row.project_id,
    algorithmVersion: row.algorithm_version,
    createdAt: row.created_at,
    summary: parseJson<{ counts: Record<string, number>; transitions: TestTransition[]; codeChanges: string[] }>(row.summary_json, { counts: {}, transitions: [], codeChanges: [] }),
    baseline: side(row.baseline_checkpoint_id),
    candidate: side(row.candidate_checkpoint_id),
    events,
    findings,
  };
}

export function setFindingOutcome(findingId: string, outcome: "confirmed" | "rejected" | "unresolved") {
  const f = db().prepare("select project_id from findings where id = ?").get(findingId) as { project_id: string } | undefined;
  if (!f) throw new AppError("NOT_FOUND", "Finding not found.");
  db().prepare("update findings set user_outcome = ? where id = ?").run(outcome, findingId);
  audit(f.project_id, "finding.outcome", "finding", findingId, { outcome });
}

export function comparisonsFor(projectId: string) {
  return db().prepare("select id, baseline_checkpoint_id, candidate_checkpoint_id, created_at from comparisons where project_id = ? order by created_at desc limit 50").all(projectId) as {
    id: string; baseline_checkpoint_id: string; candidate_checkpoint_id: string; created_at: string;
  }[];
}
