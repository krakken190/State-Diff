/**
 * Demo driver for the simulated rig (no physical hardware needed).
 *
 *   pnpm demo setup            create the demo firmware Git repo + project
 *   pnpm demo step a|b|c       advance the bench and create a checkpoint via the CLI
 *        [--upload]            also upload the rendered bench photo (otherwise upload it in the UI)
 *        [--analyze]           also run vision analysis (needs MODEL_API_KEY or VISION_PROVIDER=replay)
 *
 * Steps: a = known-good (PASS) · b = firmware tweak committed + yellow jumper
 * moved GPIO18→GPIO19 (motor_test FAIL) · c = jumper restored (PASS).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createCheckpoint, readConfig, writeConfig } from "./statediff";

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");
const REPO = path.join(DATA, "demo-firmware");
const STATE = path.join(DATA, "demo-state.json");
const API = process.env.STATEDIFF_API ?? "http://localhost:3000";
const TSX = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");

const STEPS = {
  a: { scene: "a-baseline", label: "Motor control working" },
  b: { scene: "b-jumper-moved", label: "Faster telemetry logging" },
  c: { scene: "c-recovery", label: "Jumper restored to GPIO18" },
} as const;

const PIN_MAP = "MOTOR_PIN = GPIO18 -> L9110S IN1 (motor control)\nDHT_PIN = GPIO4 -> DHT22 DATA (sensor)";

const git = (...args: string[]) => execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();

async function api<T>(method: string, route: string, body?: unknown, form?: FormData): Promise<T> {
  const res = await fetch(`${API}/api${route}`, {
    method,
    headers: form ? undefined : { "content-type": "application/json" },
    body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const json = (await res.json()) as { data?: T; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.data as T;
}

async function setup() {
  if (fs.existsSync(REPO)) fs.rmSync(REPO, { recursive: true, force: true });
  fs.mkdirSync(REPO, { recursive: true });
  fs.cpSync(path.join(ROOT, "demo", "firmware"), REPO, { recursive: true });
  fs.writeFileSync(path.join(REPO, ".gitignore"), ".statediff.json\n.rig-scene\n.pio/\n");
  git("init", "-b", "main");
  git("config", "user.name", "StateDiff Demo");
  git("config", "user.email", "demo@statediff.local");
  git("config", "core.autocrlf", "false");
  git("add", ".");
  git("commit", "-m", "Motor controller firmware: L9110S on GPIO18, DHT22 on GPIO4");

  const project = await api<{ id: string }>("POST", "/projects", {
    name: "ESP32 Motor Controller",
    description: "Simulated rig: ESP32 DevKitC + L9110S motor driver + DHT22. Photos are rendered; tests are simulated.",
    boardFamily: "ESP32",
    hardwareContext: PIN_MAP,
  });
  const sim = (name: string) => ({ name, argv: ["node", TSX, path.join(ROOT, "demo", "sim-cli.ts"), name], simulated: true });
  writeConfig(REPO, { projectId: project.id, api: API, tests: [sim("motor_test"), sim("sensor_test")] });
  fs.writeFileSync(STATE, JSON.stringify({ projectId: project.id }, null, 2));
  console.log(`Demo ready. Project: ${API}/projects/${project.id}\nFirmware repo: ${REPO}`);
}

async function step(which: keyof typeof STEPS, opts: { upload: boolean; analyze: boolean }) {
  readConfig(REPO);
  const s = STEPS[which];
  if (which === "b") {
    const file = path.join(REPO, "src", "config.h");
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/LOG_INTERVAL_MS \d+/, "LOG_INTERVAL_MS 250"));
    git("commit", "-am", "Faster telemetry logging (250 ms)");
    console.log("Committed firmware change: LOG_INTERVAL_MS 1000 -> 250");
    console.log("Bench change: yellow jumper moved from GPIO18 to GPIO19");
  }
  if (which === "c") console.log("Bench change: yellow jumper moved back to GPIO18");
  fs.writeFileSync(path.join(REPO, ".rig-scene"), path.join(ROOT, "demo", "scenes", `${s.scene}.json`));

  const checkpointId = await createCheckpoint(REPO, s.label, { includePatch: true });
  const image = path.join(ROOT, "demo", "images", `${s.scene}.jpg`);
  if (opts.upload) {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(fs.readFileSync(image))], { type: "image/jpeg" }), `${s.scene}.jpg`);
    await api("POST", `/checkpoints/${checkpointId}/captures`, undefined, form);
    console.log(`  uploaded ${path.relative(ROOT, image)}`);
    if (opts.analyze) {
      const run = await api<{ status: string; provider: string; error_message: string | null }>("POST", `/checkpoints/${checkpointId}/analyze`, {});
      console.log(`  analysis: ${run.status} (${run.provider})${run.error_message ? ` — ${run.error_message}` : ""}`);
    }
  } else {
    console.log(`  Photo to upload: ${image}`);
  }
}

async function main() {
  const [cmd, which] = process.argv.slice(2);
  if (cmd === "setup") return setup();
  if (cmd === "step" && which && which in STEPS) {
    return step(which as keyof typeof STEPS, { upload: process.argv.includes("--upload"), analyze: process.argv.includes("--analyze") });
  }
  console.log("Usage: pnpm demo setup | pnpm demo step <a|b|c> [--upload] [--analyze]");
}

main().catch((err) => {
  console.error(`demo: ${(err as Error).message}`);
  process.exit(1);
});
