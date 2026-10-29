import { handle, idParam, type IdCtx } from "@/lib/api";
import { startManualReview } from "@/lib/repo/analysis";

export const POST = handle(async (_req, ctx: IdCtx) => startManualReview(await idParam(ctx)));
