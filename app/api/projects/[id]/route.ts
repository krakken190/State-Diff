import { z } from "zod";
import { handle, idParam, jsonBody, type IdCtx } from "@/lib/api";
import { comparisonsFor } from "@/lib/repo/comparisons";
import { deleteProject, getProject, timeline, updateProjectContext } from "@/lib/repo/projects";

export const GET = handle(async (_req, ctx: IdCtx) => {
  const id = await idParam(ctx);
  return { project: getProject(id), timeline: timeline(id), comparisons: comparisonsFor(id) };
});

export const PATCH = handle(async (req, ctx: IdCtx) => {
  const body = await jsonBody(req, z.object({ hardwareContext: z.string().max(2000) }).strict());
  return updateProjectContext(await idParam(ctx), body.hardwareContext);
});

export const DELETE = handle(async (_req, ctx: IdCtx) => {
  deleteProject(await idParam(ctx));
  return { deleted: true };
});
