import fs from "node:fs";
import path from "node:path";

/** Finds a scene's bench image. PNG wins, so enhanced images take priority over rendered JPGs. */
export function demoImagePath(root: string, scene: string): string {
  const found = ["png", "jpg", "jpeg", "webp"].map((ext) => path.join(root, "demo", "images", `${scene}.${ext}`)).find((p) => fs.existsSync(p));
  if (!found) throw new Error(`No image for scene "${scene}" in demo/images`);
  return found;
}
