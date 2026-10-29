import "server-only";
import fs from "node:fs";
import path from "node:path";
import { dataDir, env } from "@/lib/env";
import { chatCompletion, estimateCostUsd, MetaApiError } from "@/lib/meta/client";
import {
  VISION_JSON_SCHEMA,
  VISION_SCHEMA_VERSION,
  validateVisionExtraction,
  type ValidationIssue,
  type VisionExtraction,
} from "@/schemas/vision";
import { EXTRACTION_PROMPT_VERSION, EXTRACTION_SYSTEM_PROMPT, extractionUserText } from "./prompt";

export type VisionInput = {
  imageBytes: Buffer;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  inputSha256: string;
  hardwareContext: string;
  /** Must already be checked against the allowlist (visionModels()). */
  model: string;
};

export type VisionRunMetadata = {
  provider: "meta" | "replay" | "fake";
  modelId: string;
  /** The allowlisted model the user picked; modelId is what the provider reports back. */
  requestedModel: string;
  promptVersion: string;
  schemaVersion: string;
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  estimatedCostUsd?: number;
  providerRequestId?: string;
  /** For replay: when the recorded live call happened. */
  recordedAt?: string;
  repairAttempted?: boolean;
};

export type VisionResult =
  | { ok: true; extraction: VisionExtraction; warnings: ValidationIssue[]; meta: VisionRunMetadata; rawContent: string }
  | { ok: false; errorCode: string; message: string; meta: VisionRunMetadata; rawContent?: string };

type Recording = {
  inputSha256: string;
  requestedModel: string;
  modelId: string;
  promptVersion: string;
  schemaVersion: string;
  recordedAt: string;
  rawContent: string;
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
};

const REPO_RECORDINGS = path.resolve(process.cwd(), "demo", "recordings");
const localRecordings = () => path.join(dataDir(), "recordings");

function baseMeta(provider: VisionRunMetadata["provider"], modelId: string, requestedModel: string): VisionRunMetadata {
  return { provider, modelId, requestedModel, promptVersion: EXTRACTION_PROMPT_VERSION, schemaVersion: VISION_SCHEMA_VERSION };
}

function parseContent(rawContent: string) {
  let json: unknown;
  try {
    json = JSON.parse(rawContent);
  } catch {
    return { ok: false as const, issues: [{ path: "", message: "response is not valid JSON" }] };
  }
  return validateVisionExtraction(json);
}

export async function extractObservations(input: VisionInput): Promise<VisionResult> {
  const provider = env().VISION_PROVIDER;
  if (provider === "replay") return replay(input);
  if (provider === "fake") throw new Error("fake provider is only available in tests");
  return extractLive(input);
}

async function extractLive(input: VisionInput): Promise<VisionResult> {
  const meta = baseMeta("meta", input.model, input.model);
  const dataUrl = `data:${input.mimeType};base64,${input.imageBytes.toString("base64")}`;
  const messages = [
    { role: "system" as const, content: EXTRACTION_SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text: extractionUserText(input.hardwareContext) },
        { type: "image_url" as const, image_url: { url: dataUrl } },
      ],
    },
  ];
  try {
    const res = await chatCompletion({
      model: input.model,
      messages,
      jsonSchema: { name: "workbench_observations", schema: VISION_JSON_SCHEMA },
    });
    Object.assign(meta, {
      modelId: res.model,
      latencyMs: res.latencyMs,
      promptTokens: res.usage.promptTokens,
      completionTokens: res.usage.completionTokens,
      estimatedCostUsd: estimateCostUsd(res.model, res.usage),
      providerRequestId: res.providerRequestId,
    });
    const parsed = parseContent(res.content);
    if (!parsed.ok) {
      return {
        ok: false,
        errorCode: "INVALID_PROVIDER_OUTPUT",
        message: parsed.issues.slice(0, 5).map((i) => `${i.path}: ${i.message}`).join("; "),
        meta,
        rawContent: res.content.slice(0, 20_000),
      };
    }
    saveRecording({
      inputSha256: input.inputSha256,
      requestedModel: input.model,
      modelId: res.model,
      promptVersion: meta.promptVersion,
      schemaVersion: meta.schemaVersion,
      recordedAt: new Date().toISOString(),
      rawContent: res.content,
      latencyMs: res.latencyMs,
      promptTokens: res.usage.promptTokens,
      completionTokens: res.usage.completionTokens,
    });
    return { ok: true, extraction: parsed.value, warnings: parsed.warnings, meta, rawContent: res.content };
  } catch (err) {
    if (err instanceof MetaApiError) return { ok: false, errorCode: err.code, message: err.message, meta };
    throw err;
  }
}

/** Replays a previously recorded *real* Meta response for the identical image bytes. */
function replay(input: VisionInput): VisionResult {
  const rec = loadRecording(input.inputSha256, input.model);
  if (!rec) {
    return {
      ok: false,
      errorCode: "REPLAY_NOT_FOUND",
      message: `No recorded ${input.model} response exists for this exact image.`,
      meta: baseMeta("replay", "none", input.model),
    };
  }
  const meta: VisionRunMetadata = {
    ...baseMeta("replay", rec.modelId, input.model),
    promptVersion: rec.promptVersion,
    schemaVersion: rec.schemaVersion,
    recordedAt: rec.recordedAt,
    latencyMs: rec.latencyMs,
    promptTokens: rec.promptTokens,
    completionTokens: rec.completionTokens,
  };
  const parsed = parseContent(rec.rawContent);
  if (!parsed.ok) {
    return { ok: false, errorCode: "INVALID_PROVIDER_OUTPUT", message: "Recorded response failed validation", meta };
  }
  return { ok: true, extraction: parsed.value, warnings: parsed.warnings, meta, rawContent: rec.rawContent };
}

function saveRecording(rec: Recording) {
  const dir = localRecordings();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, recordingName(rec.inputSha256, rec.requestedModel)), JSON.stringify(rec, null, 2));
}

// One recording per image per model, so both models' answers for a photo can be replayed.
function recordingName(sha: string, model: string) {
  return `${sha}.${model.replace(/[^a-z0-9.-]/gi, "_")}.json`;
}

function loadRecording(sha: string, model: string): Recording | undefined {
  if (!/^[a-f0-9]{64}$/.test(sha)) return undefined;
  for (const dir of [REPO_RECORDINGS, localRecordings()]) {
    const file = path.join(dir, recordingName(sha, model));
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as Recording;
  }
  return undefined;
}
