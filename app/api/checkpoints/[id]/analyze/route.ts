import { z } from "zod";
import { handle, idParam, jsonBody, type IdCtx } from "@/lib/api";
import { analyzeCheckpoint } from "@/lib/repo/analysis";

export const maxDuration = 120;

export const POST = handle(async (req, ctx: IdCtx) => {
  const body = await jsonBody(req, z.object({ force: z.boolean().optional() }).strict());
  return analyzeCheckpoint(await idParam(ctx), body);
});
