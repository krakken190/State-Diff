import { z } from "zod";
import { handle, idParam, jsonBody, type IdCtx } from "@/lib/api";
import { createCheckpoint } from "@/lib/repo/projects";

const Body = z.object({ label: z.string().trim().min(1).max(160), notes: z.string().max(4000).optional() }).strict();

export const POST = handle(async (req, ctx: IdCtx) => createCheckpoint(await idParam(ctx), await jsonBody(req, Body)));
