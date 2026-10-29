import "server-only";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "@/lib/env";

const ID = /^[0-9a-f-]{36}$/;

function root() {
  return path.join(dataDir(), "captures");
}

/** Server-constructed relative path; ids are validated so no client input reaches the filesystem path. */
export function captureDir(projectId: string, checkpointId: string, captureId: string): string {
  for (const id of [projectId, checkpointId, captureId]) if (!ID.test(id)) throw new Error("invalid id in storage path");
  return path.posix.join(projectId, checkpointId, captureId);
}

export function writeObject(relPath: string, bytes: Buffer) {
  const abs = resolveSafe(relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, bytes, { flag: "wx" }); // never overwrite evidence
}

export function readObject(relPath: string): Buffer {
  return fs.readFileSync(resolveSafe(relPath));
}

export function deleteProjectObjects(projectId: string) {
  if (!ID.test(projectId)) throw new Error("invalid project id");
  fs.rmSync(path.join(root(), projectId), { recursive: true, force: true });
}

function resolveSafe(relPath: string): string {
  const base = root();
  const abs = path.resolve(base, relPath);
  if (!abs.startsWith(base + path.sep)) throw new Error("path escapes storage root");
  return abs;
}
