import { AppError, handle, idParam, type IdCtx } from "@/lib/api";
import { env } from "@/lib/env";
import { addCapture } from "@/lib/repo/projects";

export const POST = handle(async (req, ctx: IdCtx) => {
  const id = await idParam(ctx);
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > env().MAX_UPLOAD_SIZE_MB * 1_000_000 + 100_000) throw new AppError("UPLOAD_REJECTED", "Image is too large.");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("VALIDATION_FAILED", "Attach the photo as form field 'file'.");
  const cap = await addCapture(id, Buffer.from(await file.arrayBuffer()));
  return { id: cap.id, width: cap.inference_width_px, height: cap.inference_height_px };
});
