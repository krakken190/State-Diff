/**
 * Simulated hardware test runner, invoked by the CLI from the demo firmware
 * repo: `sim-cli.ts <test_name>`. Reads firmware pins from src/config.h and
 * the bench's current wiring from the scene named in .rig-scene.
 */
import fs from "node:fs";
import path from "node:path";
import type { Scene } from "./scene";
import { parseFirmwareConfig, runSimTests } from "./sim-test";

const name = process.argv[2];
const repo = process.cwd();
const scenePath = fs.readFileSync(path.join(repo, ".rig-scene"), "utf8").trim();
const scene = JSON.parse(fs.readFileSync(scenePath, "utf8")) as Scene;
const fw = parseFirmwareConfig(fs.readFileSync(path.join(repo, "src", "config.h"), "utf8"));
const result = runSimTests(scene, fw).find((r) => r.name === name);
if (!result) {
  console.error(`unknown simulated test: ${name}`);
  process.exit(2);
}
console.log(result.output);
process.exit(result.exitCode);
