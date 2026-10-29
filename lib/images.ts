import "server-only";
import crypto from "node:crypto";
import sharp, { type Metadata } from "sharp";

export const IMAGE_PIPELINE_VERSION = "img-v1";
const MAX_PIXELS = 24_000_000;
const INFERENCE_MAX_EDGE = 1600;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "heif"]);

export class UploadRejected extends Error {}

export type ProcessedImage = {
  original: { bytes: Buffer; sha256: string; mimeType: string; ext: string };
  inference: { bytes: Buffer; sha256: string; width: number; height: number };
  width: number;
  height: number;
};

export const sha256 = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");

/**
 * Validates an uploaded image by decoding it (not by trusting extension or
 * MIME), then produces the EXIF-free, orientation-normalized, size-bounded
 * variant that is sent to the model and used for overlays. The original
 * bytes are kept untouched so their digest stays meaningful.
 */
export async function processUpload(bytes: Buffer, maxBytes: number): Promise<ProcessedImage> {
  if (bytes.length === 0) throw new UploadRejected("The file is empty.");
  if (bytes.length > maxBytes) throw new UploadRejected(`Image is larger than ${Math.round(maxBytes / 1_000_000)} MB.`);

  let meta: Metadata;
  try {
    meta = await sharp(bytes, { limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw new UploadRejected("This file is not a supported image.");
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) throw new UploadRejected("Use a JPEG, PNG, WebP or HEIC photo.");
  if (!meta.width || !meta.height) throw new UploadRejected("Could not read image dimensions.");
  if (meta.width * meta.height > MAX_PIXELS) throw new UploadRejected("Image resolution is too large (max 24 MP).");

  // rotate() with no args applies EXIF orientation; sharp drops metadata on output by default.
  const { data, info } = await sharp(bytes, { limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize({ width: INFERENCE_MAX_EDGE, height: INFERENCE_MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer({ resolveWithObject: true });

  const ext = meta.format === "jpeg" ? "jpg" : meta.format;
  return {
    original: { bytes, sha256: sha256(bytes), mimeType: `image/${meta.format}`, ext },
    inference: { bytes: data, sha256: sha256(data), width: info.width, height: info.height },
    width: meta.autoOrient?.width ?? meta.width,
    height: meta.autoOrient?.height ?? meta.height,
  };
}
