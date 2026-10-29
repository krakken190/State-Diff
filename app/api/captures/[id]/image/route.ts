import { AppError, idParam, type IdCtx } from "@/lib/api";
import { getCapture } from "@/lib/repo/projects";
import { readObject } from "@/lib/storage";

/** Serves the EXIF-stripped inference image (what overlays are drawn on), never the original upload. */
export async function GET(_req: Request, ctx: IdCtx) {
  try {
    const capture = getCapture(await idParam(ctx));
    return new Response(new Uint8Array(readObject(capture.inference_path)), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
    });
  } catch (err) {
    const notFound = err instanceof AppError;
    return new Response(notFound ? "Not found" : "Error", { status: notFound ? 404 : 500 });
  }
}
