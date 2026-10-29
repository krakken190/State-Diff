/**
 * StateDiff local companion CLI (PRD §13). Reads Git state, runs only the
 * test commands configured in .statediff.json (argv arrays, no shell), and
 * sends results to the local StateDiff app. It never executes commands that
 * come from the server or a model.
 *
 *   pnpm sd init --project <id> [--repo <path>] [--api http://localhost:3000]
 *   pnpm sd checkpoint --label "After wiring change" [--repo <path>] [--include-patch] [--no-tests]
 *   pnpm sd test [--repo <path>]
 *   pnpm sd status [--repo <path>]
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type TestConfig = { name: string; argv: string[]; simulated?: boolean; timeoutMs?: number };
export type RepoConfig = { projectId: string; api: string; tests: TestConfig[] };

const CONFIG_FILE = ".statediff.json";
const MAX_OUTPUT = 4000;

export function readConfig(repo: string): RepoConfig {
  const file = path.join(repo, CONFIG_FILE);
  if (!fs.existsSync(file)) throw new Error(`No ${CONFIG_FILE} in ${repo}. Run: pnpm sd init --project <id> --repo ${repo}`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as RepoConfig;
}

export function writeConfig(repo: string, cfg: RepoConfig) {
  fs.writeFileSync(path.join(repo, CONFIG_FILE), JSON.stringify(cfg, null, 2) + "\n");
}

const git = (repo: string, args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();

async function call<T>(cfg: RepoConfig, method: string, route: string, body?: unknown): Promise<T> {
  const res = await fetch(`${cfg.api}/api${route}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as { data?: T; error?: { code: string; message: string } };
  if (json.error) throw new Error(`${json.error.code}: ${json.error.message}`);
  return json.data as T;
}

export function gitSnapshot(repo: string, sinceSha: string | null, includePatch: boolean) {
  const sha = git(repo, ["rev-parse", "HEAD"]);
  const branch = git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const dirty = git(repo, ["status", "--porcelain"]).split("\n").some((l) => l.trim() && !l.endsWith(CONFIG_FILE) && !l.includes(".rig-scene"));
  const message = git(repo, ["log", "-1", "--pretty=%s"]);
  let changedFiles: { path: string; changedLines: string[] }[] = [];
  let diffStat: string | undefined;
  if (sinceSha && sinceSha !== sha) {
    const range = `${sinceSha}..${sha}`;
    const files = git(repo, ["diff", "--name-only", range]).split("\n").filter(Boolean);
    diffStat = git(repo, ["diff", "--stat", range]).slice(0, 4000);
    changedFiles = files.map((f) => ({
      path: f,
      // Patch content leaves the machine only when explicitly requested.
      changedLines: includePatch
        ? git(repo, ["diff", "-U0", range, "--", f])
            .split("\n")
            .filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l))
            .slice(0, 60)
            .map((l) => l.slice(0, 300))
        : [],
    }));
  }
  return { commitSha: sha, branch, isDirty: dirty, commitMessage: message, changedFiles, diffStat };
}

export function runTest(repo: string, t: TestConfig): Promise<{ name: string; status: "pass" | "fail" | "error"; exitCode?: number; durationMs: number; output: string }> {
  const [cmd, ...args] = t.argv;
  const exe = cmd === "node" ? process.execPath : cmd;
  console.log(`  $ ${t.argv.join(" ")}`);
  const started = Date.now();
  return new Promise((resolve) => {
    let output = "";
    const child = spawn(exe, args, { cwd: repo, shell: false, timeout: t.timeoutMs ?? 120_000 });
    const collect = (d: Buffer) => {
      if (output.length < MAX_OUTPUT * 2) output += d.toString();
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (err) => resolve({ name: t.name, status: "error", durationMs: Date.now() - started, output: err.message }));
    child.on("close", (code) =>
      resolve({ name: t.name, status: code === 0 ? "pass" : "fail", exitCode: code ?? undefined, durationMs: Date.now() - started, output: output.slice(-MAX_OUTPUT) }),
    );
  });
}

async function runAndAttach(repo: string, cfg: RepoConfig, checkpointId: string) {
  if (cfg.tests.length === 0) return;
  const runs = [];
  for (const t of cfg.tests) {
    const r = await runTest(repo, t);
    console.log(`  ${r.status === "pass" ? "✓" : "✕"} ${r.name}: ${r.status.toUpperCase()}`);
    runs.push({ ...r, source: t.simulated ? "simulated" : "cli" });
  }
  await call(cfg, "POST", `/checkpoints/${checkpointId}/test-runs`, { runs });
}

export async function createCheckpoint(repo: string, label: string, opts: { includePatch?: boolean; tests?: boolean } = {}) {
  const cfg = readConfig(repo);
  const latest = await call<{ lastCommitSha: string | null }>(cfg, "GET", `/projects/${cfg.projectId}/latest`);
  const cp = await call<{ id: string }>(cfg, "POST", `/projects/${cfg.projectId}/checkpoints`, { label });
  const snap = gitSnapshot(repo, latest.lastCommitSha, !!opts.includePatch);
  await call(cfg, "POST", `/checkpoints/${cp.id}/git-revisions`, { ...snap, source: "cli" });
  console.log(`Checkpoint "${label}" · commit ${snap.commitSha.slice(0, 7)} on ${snap.branch}${snap.isDirty ? " (dirty)" : ""}`);
  if (snap.changedFiles.length) console.log(`  changed since last checkpoint: ${snap.changedFiles.map((f) => f.path).join(", ")}`);
  if (opts.tests !== false) await runAndAttach(repo, cfg, cp.id);
  console.log(`  Add the photo: ${cfg.api}/checkpoints/${cp.id}`);
  return cp.id;
}

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main(argv: string[]) {
  const [command] = argv;
  const repo = path.resolve(arg(argv, "repo") ?? process.cwd());
  switch (command) {
    case "init": {
      const projectId = arg(argv, "project");
      if (!projectId) throw new Error("--project <id> is required");
      const prev = fs.existsSync(path.join(repo, CONFIG_FILE)) ? readConfig(repo) : undefined;
      writeConfig(repo, { projectId, api: arg(argv, "api") ?? prev?.api ?? "http://localhost:3000", tests: prev?.tests ?? [] });
      console.log(`Linked ${repo} to project ${projectId}. Add test commands to ${CONFIG_FILE} ("tests": [{"name": "...", "argv": [...]}]).`);
      return;
    }
    case "checkpoint": {
      const label = arg(argv, "label");
      if (!label) throw new Error('--label "..." is required');
      await createCheckpoint(repo, label, { includePatch: argv.includes("--include-patch"), tests: !argv.includes("--no-tests") });
      return;
    }
    case "test": {
      const cfg = readConfig(repo);
      const latest = await call<{ latest: { id: string; label: string } | null }>(cfg, "GET", `/projects/${cfg.projectId}/latest`);
      if (!latest.latest) throw new Error("No checkpoint yet. Run `pnpm sd checkpoint` first.");
      console.log(`Running tests for "${latest.latest.label}"`);
      await runAndAttach(repo, cfg, latest.latest.id);
      return;
    }
    case "status": {
      const cfg = readConfig(repo);
      const s = await call<{ project: { name: string }; latest: { label: string; status: string } | null; lastCommitSha: string | null }>(cfg, "GET", `/projects/${cfg.projectId}/latest`);
      console.log(`Project: ${s.project.name}\nLatest checkpoint: ${s.latest ? `${s.latest.label} (${s.latest.status})` : "none"}\nLast linked commit: ${s.lastCommitSha?.slice(0, 7) ?? "none"}`);
      return;
    }
    default:
      console.log("Usage: pnpm sd <init|checkpoint|test|status> [options]  (see scripts/statediff.ts)");
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`statediff: ${(err as Error).message}`);
    process.exit(1);
  });
}
