import { handle, idParam, type IdCtx } from "@/lib/api";
import { getRun, latestAnalysis } from "@/lib/repo/analysis";
import { capturesFor, getProject, latestGit, latestTests } from "@/lib/repo/projects";
import { reviewState } from "@/lib/repo/review";

export const GET = handle(async (_req, ctx: IdCtx) => {
  const id = await idParam(ctx);
  const review = reviewState(id);
  const run = latestAnalysis(id);
  return {
    ...review,
    project: getProject(review.checkpoint.project_id),
    captures: capturesFor(id).map((c) => ({ id: c.id, width: c.inference_width_px, height: c.inference_height_px, sha256: c.sha256 })),
    analysis: run ? getRun(run.id) : null,
    tests: latestTests(id),
    git: latestGit(id) ?? null,
  };
});
