import { z } from "zod";
import { handle, idParam, jsonBody, type IdCtx } from "@/lib/api";
import { addCorrection, CorrectionInput } from "@/lib/repo/review";

const Body = z.object({ expectedRevision: z.number().int().nonnegative(), correction: CorrectionInput }).strict();

export const POST = handle(async (req, ctx: IdCtx) => {
  const body = await jsonBody(req, Body);
  return addCorrection(await idParam(ctx), body.correction, body.expectedRevision);
});
