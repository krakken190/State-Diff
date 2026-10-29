import "server-only";
import { AppError } from "@/lib/api";
import { db, newId, now, parseJson, transaction } from "@/lib/db";
import { env } from "@/lib/env";
import { readObject } from "@/lib/storage";
import { extractObservations } from "@/lib/vision/provider";
import { audit, capturesFor, getCheckpoint, getProject, setCheckpointStatus } from "./projects";

export type AnalysisRunRow = {
  id: string;
  checkpoint_id: string;
  capture_id: string;
  provider: "meta" | "replay" | "fake" | "manual";
  model_id: string;
  prompt_version: string;
  schema_version: string;
  input_sha256: string;
  status: "running" | "succeeded" | "failed";
  meta_json: string;
  warnings_json: string;
  scene_quality_json: string | null;
  uncertainties_json: string;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
};

export function latestAnalysis(checkpointId: string): AnalysisRunRow | undefined {
  return db().prepare("select * from analysis_runs where checkpoint_id = ? order by created_at desc limit 1").get(checkpointId) as AnalysisRunRow | undefined;
}

export function latestSuccessfulAnalysis(checkpointId: string): AnalysisRunRow | undefined {
  return db()
    .prepare("select * from analysis_runs where checkpoint_id = ? and status = 'succeeded' order by created_at desc limit 1")
    .get(checkpointId) as AnalysisRunRow | undefined;
}

function liveCallsToday(): number {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  return (db().prepare("select count(*) as n from analysis_runs where provider = 'meta' and created_at >= ?").get(since.toISOString()) as { n: number }).n;
}

/**
 * Runs vision extraction for a checkpoint's first photo. A succeeded run for
 * the same image + prompt is reused unless `force` is set, so repeated clicks
 * don't spend inference budget. Failures never delete the capture.
 */
export async function analyzeCheckpoint(checkpointId: string, opts: { force?: boolean } = {}) {
  const cp = getCheckpoint(checkpointId);
  if (cp.status === "sealed") throw new AppError("CONFLICT", "Checkpoint is sealed.");
  if (cp.status === "analyzing") throw new AppError("CONFLICT", "Analysis is already running for this checkpoint.");
  const [capture] = capturesFor(cp.id);
  if (!capture) throw new AppError("VALIDATION_FAILED", "Add a photo before analyzing.");

  const existing = latestSuccessfulAnalysis(cp.id);
  if (existing && !opts.force && existing.input_sha256 === capture.inference_sha256) {
    setCheckpointStatus(cp.id, "needs_review");
    return existing;
  }
  const { VISION_PROVIDER, INFERENCE_DAILY_LIMIT } = env();
  if (VISION_PROVIDER === "meta" && liveCallsToday() >= INFERENCE_DAILY_LIMIT) {
    throw new AppError("QUOTA_EXCEEDED", `Daily live inference limit (${INFERENCE_DAILY_LIMIT}) reached. Raise INFERENCE_DAILY_LIMIT to continue.`);
  }

  const project = getProject(cp.project_id);
  const runId = newId();
  const started = now();
  db().prepare(
    `insert into analysis_runs (id, project_id, checkpoint_id, capture_id, provider, model_id, prompt_version, schema_version, input_sha256, status, started_at, created_at)
     values (?, ?, ?, ?, ?, 'pending', 'pending', 'pending', ?, 'running', ?, ?)`,
  ).run(runId, cp.project_id, cp.id, capture.id, VISION_PROVIDER, capture.inference_sha256, started, started);
  setCheckpointStatus(cp.id, "analyzing");
  audit(cp.project_id, "analysis.started", "analysis_run", runId);

  let result: Awaited<ReturnType<typeof extractObservations>>;
  try {
    result = await extractObservations({
      imageBytes: readObject(capture.inference_path),
      mimeType: "image/jpeg",
      inputSha256: capture.inference_sha256,
      hardwareContext: project.hardware_context ?? "",
    });
  } catch (err) {
    result = {
      ok: false,
      errorCode: "INTERNAL_ERROR",
      message: (err as Error).message.slice(0, 300),
      meta: { provider: VISION_PROVIDER, modelId: "unknown", promptVersion: "unknown", schemaVersion: "unknown" },
    };
  }

  const m = result.meta;
  if (!result.ok) {
    db().prepare(
      `update analysis_runs set status = 'failed', provider = ?, model_id = ?, prompt_version = ?, schema_version = ?, meta_json = ?, raw_content = ?,
         error_code = ?, error_message = ?, completed_at = ? where id = ?`,
    ).run(m.provider, m.modelId, m.promptVersion, m.schemaVersion, JSON.stringify(m), result.rawContent ?? null, result.errorCode, result.message.slice(0, 500), now(), runId);
    setCheckpointStatus(cp.id, "analysis_failed");
    audit(cp.project_id, "analysis.failed", "analysis_run", runId, { errorCode: result.errorCode });
    return getRun(runId);
  }

  const { extraction } = result;
  transaction(db(), () => {
    const t = now();
    for (const c of extraction.components) {
      db().prepare(
        `insert into component_observations (id, project_id, checkpoint_id, analysis_run_id, observation_key, kind, label, bbox_json, confidence, evidence_note, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(newId(), cp.project_id, cp.id, runId, c.key, c.kind, c.label, JSON.stringify(c.bbox), c.confidence, c.evidenceNote, t);
    }
    for (const c of extraction.connections) {
      db().prepare(
        `insert into connection_observations (id, project_id, checkpoint_id, analysis_run_id, observation_key, wire_color, endpoint_a_json, endpoint_b_json, bbox_json, confidence, evidence_note, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(newId(), cp.project_id, cp.id, runId, c.key, c.wireColor.toLowerCase(), JSON.stringify(c.endpointA), JSON.stringify(c.endpointB), JSON.stringify(c.bbox), c.confidence, c.evidenceNote, t);
    }
    db().prepare(
      `update analysis_runs set status = 'succeeded', provider = ?, model_id = ?, prompt_version = ?, schema_version = ?, meta_json = ?, raw_content = ?,
         warnings_json = ?, scene_quality_json = ?, uncertainties_json = ?, completed_at = ? where id = ?`,
    ).run(m.provider, m.modelId, m.promptVersion, m.schemaVersion, JSON.stringify(m), result.rawContent.slice(0, 50_000), JSON.stringify(result.warnings),
      JSON.stringify(extraction.sceneQuality), JSON.stringify(extraction.uncertainties), now(), runId);
  });
  setCheckpointStatus(cp.id, "needs_review");
  audit(cp.project_id, "analysis.completed", "analysis_run", runId, { components: extraction.components.length, connections: extraction.connections.length });
  return getRun(runId);
}

/** Lets the user continue without AI (provider outage or preference): review starts empty and they add observations by hand. */
export function startManualReview(checkpointId: string) {
  const cp = getCheckpoint(checkpointId);
  if (cp.status === "sealed") throw new AppError("CONFLICT", "Checkpoint is sealed.");
  if (capturesFor(cp.id).length === 0) throw new AppError("VALIDATION_FAILED", "Add a photo first.");
  setCheckpointStatus(cp.id, "needs_review");
  return getCheckpoint(cp.id);
}

export function getRun(id: string) {
  const row = db().prepare("select * from analysis_runs where id = ?").get(id) as AnalysisRunRow;
  return { ...row, meta: parseJson<Record<string, unknown>>(row.meta_json, {}) };
}
