import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { UploadRejected } from "@/lib/images";

export type ErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "CONFLICT"
  | "UPLOAD_REJECTED"
  | "ANALYSIS_UNAVAILABLE"
  | "SNAPSHOT_NOT_READY"
  | "QUOTA_EXCEEDED"
  | "INTERNAL_ERROR";

const STATUS: Record<ErrorCode, number> = {
  NOT_FOUND: 404,
  VALIDATION_FAILED: 400,
  CONFLICT: 409,
  UPLOAD_REJECTED: 422,
  ANALYSIS_UNAVAILABLE: 502,
  SNAPSHOT_NOT_READY: 409,
  QUOTA_EXCEEDED: 429,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const Uuid = z.uuid();

export type IdCtx = { params: Promise<{ id: string }> };

export async function idParam(ctx: IdCtx): Promise<string> {
  const { id } = await ctx.params;
  const parsed = Uuid.safeParse(id);
  if (!parsed.success) throw new AppError("NOT_FOUND", "Not found.");
  return parsed.data;
}

/** Local app: reject cross-site mutations (a page on another origin POSTing to localhost). */
function assertSameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) throw new AppError("VALIDATION_FAILED", "Cross-origin request rejected.");
}

/** Wraps a route handler with a request id, error envelope and safe logging. */
export function handle<Ctx>(fn: (req: Request, ctx: Ctx) => Promise<unknown>) {
  return async (req: Request, ctx: Ctx) => {
    const requestId = crypto.randomUUID();
    const started = Date.now();
    try {
      assertSameOrigin(req);
      const data = await fn(req, ctx);
      log({ requestId, path: new URL(req.url).pathname, method: req.method, outcome: "ok", durationMs: Date.now() - started });
      return NextResponse.json({ data, requestId });
    } catch (err) {
      let code: ErrorCode = "INTERNAL_ERROR";
      let message = "Something went wrong.";
      if (err instanceof AppError) ({ code, message } = err);
      else if (err instanceof UploadRejected) [code, message] = ["UPLOAD_REJECTED", err.message];
      else if (err instanceof z.ZodError) [code, message] = ["VALIDATION_FAILED", err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")];
      else console.error(`[${requestId}]`, err);
      log({ requestId, path: new URL(req.url).pathname, method: req.method, outcome: "error", errorCode: code, durationMs: Date.now() - started });
      return NextResponse.json({ error: { code, message }, requestId }, { status: STATUS[code] });
    }
  };
}

export async function jsonBody<T extends z.ZodType>(req: Request, schema: T, maxBytes = 64_000): Promise<z.infer<T>> {
  const text = await req.text();
  if (text.length > maxBytes) throw new AppError("VALIDATION_FAILED", "Request body too large.");
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new AppError("VALIDATION_FAILED", "Body must be JSON.");
  }
  return schema.parse(raw);
}

function log(fields: Record<string, unknown>) {
  console.log(JSON.stringify({ t: new Date().toISOString(), ...fields }));
}
