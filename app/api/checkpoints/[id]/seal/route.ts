import { handle, idParam, type IdCtx } from "@/lib/api";
import { sealCheckpoint } from "@/lib/repo/snapshots";

export const POST = handle(async (_req, ctx: IdCtx) => sealCheckpoint(await idParam(ctx)));
