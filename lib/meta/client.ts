import "server-only";
import { env } from "@/lib/env";

export type MetaErrorCode =
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_BAD_REQUEST"
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_PROVIDER_OUTPUT";

export class MetaApiError extends Error {
  constructor(
    readonly code: MetaErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ChatContentPart[] };

export type ChatCompletionRequest = {
  messages: ChatMessage[];
  jsonSchema?: { name: string; schema: object };
  model?: string;
  timeoutMs?: number;
};

export type ChatCompletionResult = {
  content: string;
  model: string;
  usage: { promptTokens?: number; completionTokens?: number };
  providerRequestId?: string;
  latencyMs: number;
};

const MAX_ATTEMPTS = 3;

/**
 * Minimal Meta Model API chat-completions client (OpenAI-compatible envelope,
 * per dev.meta.ai docs). Retries only rate limits, timeouts and 5xx; auth and
 * request errors fail immediately.
 */
export async function chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResult> {
  const { MODEL_API_KEY, META_MODEL_BASE_URL, META_VISION_MODEL } = env();
  if (!MODEL_API_KEY) throw new MetaApiError("PROVIDER_NOT_CONFIGURED", "MODEL_API_KEY is not set");

  const body: Record<string, unknown> = {
    model: req.model ?? META_VISION_MODEL,
    messages: req.messages,
  };
  if (req.jsonSchema) {
    body.response_format = { type: "json_schema", json_schema: req.jsonSchema };
  }

  let lastError: MetaApiError | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = Date.now();
    try {
      const res = await fetch(`${META_MODEL_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${MODEL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(req.timeoutMs ?? 90_000),
      });
      if (res.status === 401 || res.status === 403) {
        throw new MetaApiError("PROVIDER_AUTH_FAILED", `Meta API rejected credentials (${res.status})`, res.status);
      }
      if (res.status === 429 || res.status >= 500) {
        lastError = new MetaApiError(
          res.status === 429 ? "PROVIDER_RATE_LIMITED" : "PROVIDER_UNAVAILABLE",
          `Meta API returned ${res.status}`,
          res.status,
        );
        await backoff(attempt, res.headers.get("retry-after"));
        continue;
      }
      if (!res.ok) {
        // Body may describe the schema problem; keep it bounded and never include our request.
        const detail = (await res.text()).slice(0, 500);
        throw new MetaApiError("PROVIDER_BAD_REQUEST", `Meta API returned ${res.status}: ${detail}`, res.status);
      }
      const json = (await res.json()) as {
        model?: string;
        id?: string;
        choices?: { message?: { content?: unknown } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const content = json.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.length === 0) {
        throw new MetaApiError("INVALID_PROVIDER_OUTPUT", "Meta API response had no message content");
      }
      return {
        content,
        model: json.model ?? String(body.model),
        usage: { promptTokens: json.usage?.prompt_tokens, completionTokens: json.usage?.completion_tokens },
        providerRequestId: json.id ?? res.headers.get("x-request-id") ?? undefined,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      if (err instanceof MetaApiError) {
        if (err.code === "PROVIDER_RATE_LIMITED" || err.code === "PROVIDER_UNAVAILABLE") continue;
        throw err;
      }
      if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) {
        lastError = new MetaApiError("PROVIDER_TIMEOUT", "Meta API request timed out");
        continue;
      }
      lastError = new MetaApiError("PROVIDER_UNAVAILABLE", `Network error calling Meta API: ${(err as Error).message}`);
      await backoff(attempt, null);
    }
  }
  throw lastError ?? new MetaApiError("PROVIDER_UNAVAILABLE", "Meta API failed");
}

async function backoff(attempt: number, retryAfter: string | null) {
  if (attempt >= MAX_ATTEMPTS) return;
  const seconds = Number(retryAfter);
  const ms = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 10_000) : 1000 * 2 ** (attempt - 1);
  await new Promise((r) => setTimeout(r, ms));
}

/** Approximate cost from Meta's published Standard pricing (checked 2026-10-22). Estimate only. */
export function estimateCostUsd(usage: ChatCompletionResult["usage"]): number | undefined {
  if (usage.promptTokens == null || usage.completionTokens == null) return undefined;
  return (usage.promptTokens * 1.25 + usage.completionTokens * 4.25) / 1_000_000;
}
