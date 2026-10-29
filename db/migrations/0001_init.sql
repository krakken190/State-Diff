-- StateDiff local edition schema (SQLite). Mirrors docs/database.md; auth/RLS
-- are replaced by a single implicit local owner. Timestamps are ISO-8601 UTC.

create table projects (
  id text primary key,
  owner_id text not null default 'local',
  name text not null check (length(name) between 1 and 120),
  description text check (description is null or length(description) <= 2000),
  hardware_context text check (hardware_context is null or length(hardware_context) <= 2000),
  created_at text not null,
  updated_at text not null,
  deleted_at text
);

create table rigs (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  name text not null,
  board_family text not null default 'unknown',
  description text,
  created_at text not null,
  unique (id, project_id)
);

create table checkpoints (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  rig_id text not null,
  label text not null check (length(label) between 1 and 160),
  status text not null check (status in ('draft','captured','analyzing','needs_review','sealed','analysis_failed')),
  notes text check (notes is null or length(notes) <= 4000),
  captured_at text,
  sealed_at text,
  active_snapshot_id text,
  created_at text not null,
  -- rig must belong to the same project
  foreign key (rig_id, project_id) references rigs(id, project_id),
  unique (id, project_id)
);
create index checkpoints_project_idx on checkpoints(project_id, rig_id, created_at desc);

create table captures (
  id text primary key,
  project_id text not null,
  checkpoint_id text not null,
  storage_path text not null unique,
  inference_path text not null,
  mime_type text not null,
  byte_size integer not null check (byte_size > 0),
  width_px integer not null check (width_px > 0),
  height_px integer not null check (height_px > 0),
  sha256 text not null check (length(sha256) = 64),
  inference_sha256 text not null check (length(inference_sha256) = 64),
  inference_width_px integer not null,
  inference_height_px integer not null,
  orientation_normalized integer not null,
  exif_stripped integer not null,
  upload_status text not null check (upload_status in ('pending','verified','rejected')),
  created_at text not null,
  foreign key (checkpoint_id, project_id) references checkpoints(id, project_id) on delete cascade
);
create index captures_checkpoint_idx on captures(checkpoint_id, created_at);

create table analysis_runs (
  id text primary key,
  project_id text not null,
  checkpoint_id text not null,
  capture_id text not null references captures(id) on delete cascade,
  provider text not null check (provider in ('meta','replay','fake','manual')),
  model_id text not null,
  prompt_version text not null,
  schema_version text not null,
  input_sha256 text not null,
  status text not null check (status in ('running','succeeded','failed')),
  raw_content text,
  meta_json text not null default '{}',
  warnings_json text not null default '[]',
  scene_quality_json text,
  uncertainties_json text not null default '[]',
  error_code text,
  error_message text,
  started_at text not null,
  completed_at text,
  created_at text not null,
  foreign key (checkpoint_id, project_id) references checkpoints(id, project_id) on delete cascade
);
create index analysis_runs_capture_idx on analysis_runs(capture_id, created_at desc);

-- Model observations: immutable once written. Review state lives in corrections.
create table component_observations (
  id text primary key,
  project_id text not null,
  checkpoint_id text not null,
  analysis_run_id text not null references analysis_runs(id) on delete cascade,
  observation_key text not null,
  kind text not null,
  label text not null,
  bbox_json text not null,
  confidence real check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evidence_note text not null default '',
  provenance text not null default 'VISION_INFERRED',
  created_at text not null,
  unique (analysis_run_id, observation_key)
);

create table connection_observations (
  id text primary key,
  project_id text not null,
  checkpoint_id text not null,
  analysis_run_id text not null references analysis_runs(id) on delete cascade,
  observation_key text not null,
  wire_color text not null default '',
  endpoint_a_json text not null,
  endpoint_b_json text not null,
  bbox_json text not null,
  confidence real check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evidence_note text not null default '',
  provenance text not null default 'VISION_INFERRED',
  created_at text not null,
  unique (analysis_run_id, observation_key)
);

-- Append-only review log. 'add' creates a user-authored observation (manual fallback).
create table corrections (
  id text primary key,
  project_id text not null,
  checkpoint_id text not null,
  analysis_run_id text,
  target_type text not null check (target_type in ('component','connection')),
  target_id text not null,
  action text not null check (action in ('accept','reject','relabel','set_endpoint','mark_unknown','add')),
  before_json text,
  after_json text,
  actor_id text not null default 'local',
  revision integer not null,
  created_at text not null,
  unique (checkpoint_id, revision),
  foreign key (checkpoint_id, project_id) references checkpoints(id, project_id) on delete cascade
);
create index corrections_checkpoint_idx on corrections(checkpoint_id, revision);

create table snapshots (
  id text primary key,
  project_id text not null,
  checkpoint_id text not null,
  version integer not null check (version >= 1),
  source_analysis_run_id text,
  correction_revision integer not null,
  materializer_version text not null,
  unresolved_json text not null default '[]',
  created_at text not null,
  unique (checkpoint_id, version),
  foreign key (checkpoint_id, project_id) references checkpoints(id, project_id) on delete cascade
);

create table snapshot_nodes (
  id text primary key,
  project_id text not null,
  snapshot_id text not null references snapshots(id) on delete cascade,
  logical_key text not null,
  kind text not null check (kind in ('board','component','terminal')),
  label text not null,
  parent_node_id text references snapshot_nodes(id),
  geometry_json text,
  provenance text not null check (provenance in ('VISION_INFERRED','USER_CONFIRMED')),
  evidence_json text not null,
  confidence real,
  unique (snapshot_id, logical_key)
);

create table snapshot_edges (
  id text primary key,
  project_id text not null,
  snapshot_id text not null references snapshots(id) on delete cascade,
  from_node_id text not null references snapshot_nodes(id),
  to_node_id text not null references snapshot_nodes(id),
  wire_color text not null default '',
  provenance text not null check (provenance in ('VISION_INFERRED','USER_CONFIRMED')),
  evidence_json text not null,
  confidence real,
  check (from_node_id <> to_node_id),
  check (from_node_id < to_node_id)
);
create index snapshot_edges_snapshot_idx on snapshot_edges(snapshot_id);

create table git_revisions (
  id text primary key,
  project_id text not null,
  checkpoint_id text not null,
  commit_sha text not null check (length(commit_sha) in (40, 64)),
  branch_name text,
  is_dirty integer,
  commit_message text,
  changed_files_json text not null default '[]',
  diff_stat text,
  source text not null check (source in ('manual','cli')),
  recorded_at text not null,
  foreign key (checkpoint_id, project_id) references checkpoints(id, project_id) on delete cascade
);

create table test_runs (
  id text primary key,
  project_id text not null,
  checkpoint_id text not null,
  name text not null check (length(name) between 1 and 120),
  status text not null check (status in ('pass','fail','error','skipped','unknown')),
  exit_code integer,
  duration_ms integer,
  output_excerpt text check (output_excerpt is null or length(output_excerpt) <= 4000),
  source text not null check (source in ('manual','cli','simulated')),
  recorded_at text not null,
  foreign key (checkpoint_id, project_id) references checkpoints(id, project_id) on delete cascade
);
create index test_runs_checkpoint_idx on test_runs(checkpoint_id, recorded_at desc);

create table comparisons (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  baseline_checkpoint_id text not null,
  candidate_checkpoint_id text not null,
  baseline_snapshot_id text not null references snapshots(id) on delete cascade,
  candidate_snapshot_id text not null references snapshots(id) on delete cascade,
  algorithm_version text not null,
  status text not null check (status in ('completed','failed')),
  summary_json text not null default '{}',
  created_at text not null
);
create index comparisons_project_idx on comparisons(project_id, created_at desc);

create table diff_events (
  id text primary key,
  project_id text not null,
  comparison_id text not null references comparisons(id) on delete cascade,
  event_key text not null,
  event_type text not null check (event_type in ('added','removed','moved','connection_changed','attribute_changed','unresolved')),
  entity_kind text not null check (entity_kind in ('component','connection')),
  description text not null,
  baseline_ref_json text,
  candidate_ref_json text,
  evidence_json text not null,
  provenance text not null,
  created_at text not null,
  unique (comparison_id, event_key)
);

create table findings (
  id text primary key,
  project_id text not null,
  comparison_id text not null references comparisons(id) on delete cascade,
  rank integer not null check (rank >= 1),
  kind text not null check (kind in ('physical','code')),
  title text not null,
  explanation text not null,
  suggested_check text not null,
  score real not null check (score >= 0 and score <= 1),
  score_breakdown_json text not null,
  uncertainty text not null check (uncertainty in ('low','medium','high')),
  evidence_json text not null,
  explanation_source text not null check (explanation_source in ('template','meta','replay')),
  explanation_model text,
  user_outcome text check (user_outcome in ('confirmed','rejected','unresolved')),
  created_at text not null,
  unique (comparison_id, rank)
);

create table audit_events (
  id text primary key,
  project_id text,
  event_type text not null,
  entity_type text,
  entity_id text,
  metadata_json text not null default '{}',
  created_at text not null
);

-- Immutability guards: evidence is never edited in place.
create trigger component_observations_immutable before update on component_observations
begin select raise(abort, 'component observations are immutable'); end;
create trigger connection_observations_immutable before update on connection_observations
begin select raise(abort, 'connection observations are immutable'); end;
create trigger corrections_immutable before update on corrections
begin select raise(abort, 'corrections are append-only'); end;
create trigger snapshots_immutable before update on snapshots
begin select raise(abort, 'snapshots are immutable'); end;
create trigger snapshot_nodes_immutable before update on snapshot_nodes
begin select raise(abort, 'snapshot nodes are immutable'); end;
create trigger snapshot_edges_immutable before update on snapshot_edges
begin select raise(abort, 'snapshot edges are immutable'); end;
create trigger captures_evidence_immutable before update of sha256, storage_path, inference_path, inference_sha256 on captures
begin select raise(abort, 'capture evidence is immutable'); end;
create trigger diff_events_immutable before update on diff_events
begin select raise(abort, 'diff events are immutable'); end;

-- Edges may only join terminals of their own snapshot.
create trigger snapshot_edges_same_snapshot before insert on snapshot_edges
when (select count(*) from snapshot_nodes n
      where n.id in (new.from_node_id, new.to_node_id)
        and n.snapshot_id = new.snapshot_id and n.kind = 'terminal') <> 2
begin select raise(abort, 'edge endpoints must be terminals in the same snapshot'); end;
