import { z } from "zod";
import { handle, idParam, jsonBody, type IdCtx } from "@/lib/api";
import { attachGitRevision } from "@/lib/repo/projects";

const Body = z
  .object({
    commitSha: z.string().regex(/^([0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/, "full 40- or 64-character commit SHA"),
    branch: z.string().max(200).optional(),
    isDirty: z.boolean().optional(),
    commitMessage: z.string().max(2000).optional(),
    changedFiles: z
      .array(z.object({ path: z.string().min(1).max(300), changedLines: z.array(z.string().max(300)).max(60) }).strict())
      .max(200)
      .optional(),
    diffStat: z.string().max(4000).optional(),
    source: z.enum(["manual", "cli"]),
  })
  .strict();

export const POST = handle(async (req, ctx: IdCtx) => attachGitRevision(await idParam(ctx), await jsonBody(req, Body, 200_000)));
