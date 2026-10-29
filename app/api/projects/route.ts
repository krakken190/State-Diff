import { z } from "zod";
import { handle, jsonBody } from "@/lib/api";
import { createProject, listProjects } from "@/lib/repo/projects";

const Body = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(2000).optional(),
    hardwareContext: z.string().max(2000).optional(),
    boardFamily: z.string().max(40).optional(),
  })
  .strict();

export const GET = handle(async () => listProjects());
export const POST = handle(async (req) => createProject(await jsonBody(req, Body)));
