import { z } from "zod";
import { handle, jsonBody } from "@/lib/api";
import { createComparison } from "@/lib/repo/comparisons";

const Body = z.object({ baselineCheckpointId: z.uuid(), candidateCheckpointId: z.uuid() }).strict();

export const POST = handle(async (req) => {
  const body = await jsonBody(req, Body);
  return { id: createComparison(body.baselineCheckpointId, body.candidateCheckpointId) };
});
