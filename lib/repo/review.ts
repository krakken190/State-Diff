import "server-only";
import { z } from "zod";
import { applyCorrections, type ComponentObservation, type ConnectionObservation, type Correction } from "@/domain/review/apply";
import { AppError } from "@/lib/api";
import { db, newId, now, parseJson, transaction } from "@/lib/db";
import { latestSuccessfulAnalysis } from "./analysis";
import { audit, capturesFor, getCheckpoint } from "./projects";

const EndpointInput = z.object({
  componentKey: z.string().max(64),
  terminalLabel: z.string().max(64),
  certainty: z.enum(["visible", "inferred", "unknown"]),
}).strict();
const BBoxInput = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().min(0).max(1), h: z.number().min(0).max(1) }).strict();

// Plain union: "add" appears twice (component vs connection), which a discriminated union can't express.
export const CorrectionInput = z.union([
  z.object({ action: z.literal("accept"), targetType: z.enum(["component", "connection"]), targetId: z.uuid() }).strict(),
  z.object({ action: z.literal("reject"), targetType: z.enum(["component", "connection"]), targetId: z.uuid() }).strict(),
  z.object({ action: z.literal("relabel"), targetType: z.literal("component"), targetId: z.uuid(), label: z.string().trim().min(1).max(120), kind: z.string().max(32).optional() }).strict(),
  z.object({ action: z.literal("set_endpoint"), targetType: z.literal("connection"), targetId: z.uuid(), endpoint: z.enum(["A", "B"]), componentKey: z.string().min(1).max(64), terminalLabel: z.string().trim().min(1).max(64) }).strict(),
  z.object({ action: z.literal("mark_unknown"), targetType: z.literal("connection"), targetId: z.uuid(), endpoint: z.enum(["A", "B"]) }).strict(),
  z.object({ action: z.literal("add"), targetType: z.literal("component"), kind: z.string().min(1).max(32), label: z.string().trim().min(1).max(120), bbox: BBoxInput }).strict(),
  z.object({ action: z.literal("add"), targetType: z.literal("connection"), wireColor: z.string().max(32), endpointA: EndpointInput, endpointB: EndpointInput, bbox: BBoxInput }).strict(),
]);
export type CorrectionInput = z.infer<typeof CorrectionInput>;

type CompRow = { id: string; observation_key: string; kind: string; label: string; bbox_json: string; confidence: number | null; evidence_note: string; capture_id: string };
type ConnRow = { id: string; observation_key: string; wire_color: string; endpoint_a_json: string; endpoint_b_json: string; bbox_json: string; confidence: number | null; evidence_note: string; capture_id: string };
type CorrRow = { revision: number; target_type: "component" | "connection"; target_id: string; action: Correction["action"]; after_json: string | null; created_at: string };

export function reviewState(checkpointId: string) {
  const cp = getCheckpoint(checkpointId);
  const run = latestSuccessfulAnalysis(cp.id);
  const [capture] = capturesFor(cp.id);
  const comps = run
    ? (db().prepare(
        "select o.*, r.capture_id from component_observations o join analysis_runs r on r.id = o.analysis_run_id where o.analysis_run_id = ?",
      ).all(run.id) as CompRow[])
    : [];
  const conns = run
    ? (db().prepare(
        "select o.*, r.capture_id from connection_observations o join analysis_runs r on r.id = o.analysis_run_id where o.analysis_run_id = ?",
      ).all(run.id) as ConnRow[])
    : [];
  // Corrections made against an older analysis run don't apply to a re-run's new observation ids, which is intended.
  const corrs = db().prepare("select * from corrections where checkpoint_id = ? order by revision").all(cp.id) as CorrRow[];

  const components: ComponentObservation[] = comps.map((r) => ({
    id: r.id, key: r.observation_key, kind: r.kind, label: r.label, bbox: JSON.parse(r.bbox_json), confidence: r.confidence, evidenceNote: r.evidence_note, captureId: r.capture_id,
  }));
  const connections: ConnectionObservation[] = conns.map((r) => ({
    id: r.id, key: r.observation_key, wireColor: r.wire_color, endpointA: JSON.parse(r.endpoint_a_json), endpointB: JSON.parse(r.endpoint_b_json),
    bbox: JSON.parse(r.bbox_json), confidence: r.confidence, evidenceNote: r.evidence_note, captureId: r.capture_id,
  }));
  const corrections: Correction[] = corrs.map((r) => ({
    revision: r.revision, targetType: r.target_type, targetId: r.target_id, action: r.action, after: parseJson(r.after_json, null), createdAt: r.created_at,
  }));
  const effective = applyCorrections(cp.id, components, connections, corrections, capture?.id ?? "");
  const revision = corrs.length ? corrs[corrs.length - 1].revision : 0;
  return { checkpoint: cp, analysisRunId: run?.id ?? null, captureId: capture?.id ?? null, revision, ...effective };
}

/** Appends one correction. `expectedRevision` gives optimistic concurrency so two tabs can't silently overwrite each other. */
export function addCorrection(checkpointId: string, input: CorrectionInput, expectedRevision: number) {
  const state = reviewState(checkpointId);
  if (state.checkpoint.status === "sealed") throw new AppError("CONFLICT", "Checkpoint is sealed. Corrections need a new checkpoint.");
  if (state.checkpoint.status !== "needs_review") throw new AppError("CONFLICT", "Analyze the photo (or start manual review) before correcting.");

  const targetId = input.action === "add" ? newId() : input.targetId;
  let before: unknown = null;
  if (input.action !== "add") {
    const target = input.targetType === "component" ? state.components.find((c) => c.observationId === targetId) : state.connections.find((c) => c.observationId === targetId);
    if (!target) throw new AppError("NOT_FOUND", "Observation not found in this checkpoint.");
    before = target;
  }
  if (input.action === "set_endpoint" && !state.components.some((c) => c.key === input.componentKey && c.review !== "rejected")) {
    throw new AppError("VALIDATION_FAILED", "Endpoint must reference a component in this checkpoint.");
  }
  const { action, targetType, ...rest } = input;
  const after: Record<string, unknown> = { ...rest };
  delete after.targetId;

  transaction(db(), () => {
    const current = (db().prepare("select coalesce(max(revision), 0) as r from corrections where checkpoint_id = ?").get(checkpointId) as { r: number }).r;
    if (current !== expectedRevision) throw new AppError("CONFLICT", "The review changed in another window. Reload and try again.");
    db().prepare(
      `insert into corrections (id, project_id, checkpoint_id, analysis_run_id, target_type, target_id, action, before_json, after_json, revision, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(newId(), state.checkpoint.project_id, checkpointId, state.analysisRunId, targetType, targetId, action, before ? JSON.stringify(before) : null, JSON.stringify(after), current + 1, now());
  });
  audit(state.checkpoint.project_id, "review.corrected", "checkpoint", checkpointId, { action, targetType });
  return reviewState(checkpointId);
}
