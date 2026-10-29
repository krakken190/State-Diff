/** Renders every scene in demo/scenes to demo/images/<id>.jpg. Usage: pnpm demo:render */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { renderSceneSvg } from "./render";
import type { Scene } from "./scene";

const root = path.resolve(__dirname);
const scenesDir = path.join(root, "scenes");
const outDir = path.join(root, "images");
fs.mkdirSync(outDir, { recursive: true });

async function main() {
for (const file of fs.readdirSync(scenesDir).filter((f) => f.endsWith(".json")).sort()) {
  const scene = JSON.parse(fs.readFileSync(path.join(scenesDir, file), "utf8")) as Scene;
  const svg = renderSceneSvg(scene);
  const out = path.join(outDir, `${scene.id}.jpg`);
  await sharp(Buffer.from(svg)).jpeg({ quality: 88, mozjpeg: true }).toFile(out);
  console.log(`rendered ${path.relative(process.cwd(), out)}`);
}
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
