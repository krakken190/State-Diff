import { handle, idParam, type IdCtx } from "@/lib/api";
import { getProject, timeline } from "@/lib/repo/projects";

/** Used by the local CLI to find the previous checkpoint's commit for change detection. */
export const GET = handle(async (_req, ctx: IdCtx) => {
  const id = await idParam(ctx);
  const project = getProject(id);
  const items = timeline(id);
  const withGit = [...items].reverse().find((c) => c.git);
  return { project: { id: project.id, name: project.name }, latest: items.at(-1) ?? null, lastCommitSha: withGit?.git?.commit_sha ?? null };
});
