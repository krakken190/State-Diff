import { handle, idParam, type IdCtx } from "@/lib/api";
import { getComparison } from "@/lib/repo/comparisons";

export const GET = handle(async (_req, ctx: IdCtx) => getComparison(await idParam(ctx)));
