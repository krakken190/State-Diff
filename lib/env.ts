import "server-only";
import path from "node:path";
import { z } from "zod";

const EnvSchema = z.object({
  MODEL_API_KEY: z.string().optional().default(""),
  META_MODEL_BASE_URL: z.url().default("https://api.meta.ai/v1"),
  META_VISION_MODEL: z.string().min(1).default("muse-spark-1.3-contributor"),
  /** Comma-separated models the UI may choose from; the default model is always allowed. */
  META_VISION_MODELS: z.string().default("muse-spark-1.3-contributor,muse-spark-1.3"),
  META_SEGMENTATION_MODEL: z.string().optional().default(""),
  VISION_PROVIDER: z.enum(["meta", "replay", "fake"]).default("meta"),
  DATA_DIR: z.string().default("./data"),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().max(50).default(12),
  MAX_IMAGES_PER_CHECKPOINT: z.coerce.number().int().positive().max(10).default(3),
  INFERENCE_DAILY_LIMIT: z.coerce.number().int().nonnegative().default(60),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function env(): Env {
  cached ??= EnvSchema.parse({
    ...process.env,
    // Treat empty strings in .env.local as "unset" so defaults apply.
    ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v === "").map(([k]) => [k, undefined])),
  });
  return cached;
}

/** Allowlisted vision models, default first. Requests naming any other model are rejected. */
export function visionModels(): { default: string; allowed: string[] } {
  const { META_VISION_MODEL, META_VISION_MODELS } = env();
  const listed = META_VISION_MODELS.split(",").map((m) => m.trim()).filter(Boolean);
  return { default: META_VISION_MODEL, allowed: [...new Set([META_VISION_MODEL, ...listed])] };
}

export function dataDir(): string {
  return path.resolve(process.cwd(), env().DATA_DIR);
}
