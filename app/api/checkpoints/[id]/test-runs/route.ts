import { z } from "zod";
import { handle, idParam, jsonBody, type IdCtx } from "@/lib/api";
import { attachTestRuns } from "@/lib/repo/projects";

const Run = z
  .object({
    name: z.string().trim().min(1).max(120),
    status: z.enum(["pass", "fail", "error", "skipped", "unknown"]),
    exitCode: z.number().int().optional(),
    durationMs: z.number().int().nonnegative().optional(),
    output: z.string().max(20_000).optional(),
    source: z.enum(["manual", "cli", "simulated"]),
  })
  .strict();

export const POST = handle(async (req, ctx: IdCtx) => {
  const body = await jsonBody(req, z.object({ runs: z.array(Run).min(1).max(50) }).strict(), 200_000);
  return attachTestRuns(await idParam(ctx), body.runs);
});
