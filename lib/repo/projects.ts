import "server-only";
import { AppError } from "@/lib/api";
import { db, newId, now, parseJson, transaction } from "@/lib/db";
import { env } from "@/lib/env";
import { processUpload } from "@/lib/images";
import { captureDir, deleteProjectObjects, writeObject } from "@/lib/storage";

export type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  hardware_context: string | null;
  created_at: string;
  updated_at: string;
};

export type CheckpointStatus = "draft" | "captured" | "analyzing" | "needs_review" | "sealed" | "analysis_failed";

export type CheckpointRow = {
  id: string;
  project_id: string;
  rig_id: string;
  label: string;
  status: CheckpointStatus;
  notes: string | null;
  captured_at: string | null;
  sealed_at: string | null;
  active_snapshot_id: string | null;
  created_at: string;
};

export type CaptureRow = {
  id: string;
  project_id: string;
  checkpoint_id: string;
  storage_path: string;
  inference_path: string;
  mime_type: string;
  sha256: string;
  inference_sha256: string;
  inference_width_px: number;
  inference_height_px: number;
  width_px: number;
  height_px: number;
  created_at: string;
};

export type TestRunRow = {
  id: string;
  checkpoint_id: string;
  name: string;
  status: "pass" | "fail" | "error" | "skipped" | "unknown";
  exit_code: number | null;
  duration_ms: number | null;
  output_excerpt: string | null;
  source: "manual" | "cli" | "simulated";
  recorded_at: string;
};

export type GitRevisionRow = {
  id: string;
  checkpoint_id: string;
  commit_sha: string;
  branch_name: string | null;
  is_dirty: number | null;
  commit_message: string | null;
  changed_files_json: string;
  diff_stat: string | null;
  source: "manual" | "cli";
  recorded_at: string;
};

export function listProjects(): ProjectRow[] {
  return db().prepare("select * from projects where deleted_at is null order by created_at desc limit 100").all() as ProjectRow[];
}

export function getProject(id: string): ProjectRow {
  const row = db().prepare("select * from projects where id = ? and deleted_at is null").get(id) as ProjectRow | undefined;
  if (!row) throw new AppError("NOT_FOUND", "Project not found.");
  return row;
}

export function createProject(input: { name: string; description?: string; hardwareContext?: string; boardFamily?: string }) {
  const id = newId();
  const rigId = newId();
  const t = now();
  transaction(db(), () => {
    db().prepare("insert into projects (id, name, description, hardware_context, created_at, updated_at) values (?, ?, ?, ?, ?, ?)")
      .run(id, input.name, input.description ?? null, input.hardwareContext ?? null, t, t);
    db().prepare("insert into rigs (id, project_id, name, board_family, created_at) values (?, ?, ?, ?, ?)")
      .run(rigId, id, "Main bench", input.boardFamily ?? "unknown", t);
    audit(id, "project.created", "project", id);
  });
  return getProject(id);
}

export function updateProjectContext(id: string, hardwareContext: string) {
  getProject(id);
  db().prepare("update projects set hardware_context = ?, updated_at = ? where id = ?").run(hardwareContext, now(), id);
  return getProject(id);
}

export function deleteProject(id: string) {
  getProject(id);
  db().prepare("update projects set deleted_at = ? where id = ?").run(now(), id);
  deleteProjectObjects(id);
  db().prepare("delete from projects where id = ?").run(id);
  audit(null, "project.deleted", "project", id);
}

export function getCheckpoint(id: string): CheckpointRow {
  const row = db()
    .prepare("select c.* from checkpoints c join projects p on p.id = c.project_id where c.id = ? and p.deleted_at is null")
    .get(id) as CheckpointRow | undefined;
  if (!row) throw new AppError("NOT_FOUND", "Checkpoint not found.");
  return row;
}

export function createCheckpoint(projectId: string, input: { label: string; notes?: string }) {
  getProject(projectId);
  const rig = db().prepare("select id from rigs where project_id = ? order by created_at limit 1").get(projectId) as { id: string };
  const id = newId();
  db().prepare("insert into checkpoints (id, project_id, rig_id, label, status, notes, created_at) values (?, ?, ?, ?, 'draft', ?, ?)")
    .run(id, projectId, rig.id, input.label, input.notes ?? null, now());
  audit(projectId, "checkpoint.created", "checkpoint", id);
  return getCheckpoint(id);
}

export function setCheckpointStatus(id: string, status: CheckpointStatus) {
  db().prepare("update checkpoints set status = ? where id = ?").run(status, id);
}

export async function addCapture(checkpointId: string, bytes: Buffer) {
  const cp = getCheckpoint(checkpointId);
  if (cp.status === "sealed") throw new AppError("CONFLICT", "This checkpoint is sealed; create a new checkpoint for a new photo.");
  const count = (db().prepare("select count(*) as n from captures where checkpoint_id = ?").get(checkpointId) as { n: number }).n;
  if (count >= env().MAX_IMAGES_PER_CHECKPOINT) throw new AppError("CONFLICT", "This checkpoint already has the maximum number of photos.");

  const img = await processUpload(bytes, env().MAX_UPLOAD_SIZE_MB * 1_000_000);
  const id = newId();
  const dir = captureDir(cp.project_id, cp.id, id);
  const storagePath = `${dir}/original.${img.original.ext}`;
  const inferencePath = `${dir}/inference.jpg`;
  writeObject(storagePath, img.original.bytes);
  writeObject(inferencePath, img.inference.bytes);
  const t = now();
  db().prepare(
    `insert into captures (id, project_id, checkpoint_id, storage_path, inference_path, mime_type, byte_size, width_px, height_px,
       sha256, inference_sha256, inference_width_px, inference_height_px, orientation_normalized, exif_stripped, upload_status, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 'verified', ?)`,
  ).run(id, cp.project_id, cp.id, storagePath, inferencePath, img.original.mimeType, img.original.bytes.length, img.width, img.height,
    img.original.sha256, img.inference.sha256, img.inference.width, img.inference.height, t);
  db().prepare("update checkpoints set status = case when status = 'draft' then 'captured' else status end, captured_at = coalesce(captured_at, ?) where id = ?").run(t, cp.id);
  audit(cp.project_id, "capture.uploaded", "capture", id);
  return getCapture(id);
}

export function getCapture(id: string): CaptureRow {
  const row = db().prepare("select * from captures where id = ?").get(id) as CaptureRow | undefined;
  if (!row) throw new AppError("NOT_FOUND", "Capture not found.");
  return row;
}

export function capturesFor(checkpointId: string): CaptureRow[] {
  return db().prepare("select * from captures where checkpoint_id = ? order by created_at").all(checkpointId) as CaptureRow[];
}

export function attachTestRuns(
  checkpointId: string,
  runs: { name: string; status: TestRunRow["status"]; exitCode?: number; durationMs?: number; output?: string; source: TestRunRow["source"] }[],
) {
  const cp = getCheckpoint(checkpointId);
  const t = now();
  transaction(db(), () => {
    for (const r of runs) {
      db().prepare(
        "insert into test_runs (id, project_id, checkpoint_id, name, status, exit_code, duration_ms, output_excerpt, source, recorded_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(newId(), cp.project_id, cp.id, r.name, r.status, r.exitCode ?? null, r.durationMs ?? null, r.output ? redact(r.output).slice(0, 4000) : null, r.source, t);
    }
  });
  audit(cp.project_id, "test.attached", "checkpoint", cp.id, { count: runs.length });
  return latestTests(cp.id);
}

export function latestTests(checkpointId: string): TestRunRow[] {
  return db()
    .prepare(
      `select * from test_runs t where checkpoint_id = ? and recorded_at = (
         select max(recorded_at) from test_runs t2 where t2.checkpoint_id = t.checkpoint_id and t2.name = t.name)
       order by name`,
    )
    .all(checkpointId) as TestRunRow[];
}

export function attachGitRevision(
  checkpointId: string,
  g: { commitSha: string; branch?: string; isDirty?: boolean; commitMessage?: string; changedFiles?: { path: string; changedLines: string[] }[]; diffStat?: string; source: "manual" | "cli" },
) {
  const cp = getCheckpoint(checkpointId);
  db().prepare(
    `insert into git_revisions (id, project_id, checkpoint_id, commit_sha, branch_name, is_dirty, commit_message, changed_files_json, diff_stat, source, recorded_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(newId(), cp.project_id, cp.id, g.commitSha.toLowerCase(), g.branch ?? null, g.isDirty == null ? null : g.isDirty ? 1 : 0,
    g.commitMessage ? redact(g.commitMessage).slice(0, 500) : null, JSON.stringify((g.changedFiles ?? []).map((f) => ({ path: f.path, changedLines: f.changedLines.map(redact) }))),
    g.diffStat ?? null, g.source, now());
  audit(cp.project_id, "git.attached", "checkpoint", cp.id);
  return latestGit(cp.id);
}

export function latestGit(checkpointId: string): (GitRevisionRow & { changedFiles: { path: string; changedLines: string[] }[] }) | undefined {
  const row = db().prepare("select * from git_revisions where checkpoint_id = ? order by recorded_at desc limit 1").get(checkpointId) as GitRevisionRow | undefined;
  return row ? { ...row, changedFiles: parseJson(row.changed_files_json, []) } : undefined;
}

export type TimelineItem = CheckpointRow & { captureId: string | null; tests: TestRunRow[]; git: ReturnType<typeof latestGit>; analysisProvider: string | null };

export function timeline(projectId: string): TimelineItem[] {
  const cps = db().prepare("select * from checkpoints where project_id = ? order by created_at asc limit 200").all(projectId) as CheckpointRow[];
  return cps.map((cp) => {
    const cap = db().prepare("select id from captures where checkpoint_id = ? order by created_at limit 1").get(cp.id) as { id: string } | undefined;
    const run = db().prepare("select provider from analysis_runs where checkpoint_id = ? and status = 'succeeded' order by created_at desc limit 1").get(cp.id) as { provider: string } | undefined;
    return { ...cp, captureId: cap?.id ?? null, tests: latestTests(cp.id), git: latestGit(cp.id), analysisProvider: run?.provider ?? null };
  });
}

/** Strips token-like strings and absolute home paths from user/CLI supplied text. */
export function redact(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/\b(sk|pk|ghp|gho|xox[abp]|AKIA)[-_A-Za-z0-9]{12,}\b/g, "[redacted]")
    .replace(/\b(?:api[_-]?key|token|secret|password)\s*[=:]\s*\S+/gi, (m) => `${m.split(/[=:]/)[0]}=[redacted]`)
    .replace(/(?:[A-Za-z]:\\Users\\|\/home\/|\/Users\/)[^\\/\s]+/g, "~");
}

export function audit(projectId: string | null, eventType: string, entityType: string, entityId: string, metadata: Record<string, unknown> = {}) {
  db().prepare("insert into audit_events (id, project_id, event_type, entity_type, entity_id, metadata_json, created_at) values (?, ?, ?, ?, ?, ?, ?)")
    .run(newId(), projectId, eventType, entityType, entityId, JSON.stringify(metadata), now());
}
