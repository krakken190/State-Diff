import { z } from "zod";
import { handle, idParam, jsonBody, type IdCtx } from "@/lib/api";
import { setFindingOutcome } from "@/lib/repo/comparisons";

export const PATCH = handle(async (req, ctx: IdCtx) => {
  const body = await jsonBody(req, z.object({ outcome: z.enum(["confirmed", "rejected", "unresolved"]) }).strict());
  setFindingOutcome(await idParam(ctx), body.outcome);
  return { ok: true };
});
