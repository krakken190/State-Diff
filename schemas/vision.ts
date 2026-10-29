import { z } from "zod";

export const VISION_SCHEMA_VERSION = "1.0";
export const MAX_COMPONENTS = 40;
export const MAX_CONNECTIONS = 40;

export const COMPONENT_KINDS = ["board", "module", "component", "breadboard", "unknown"] as const;
export const ENDPOINT_CERTAINTIES = ["visible", "inferred", "unknown"] as const;
const QUALITY_LEVELS = ["good", "fair", "poor"] as const;
const AMOUNT_LEVELS = ["low", "medium", "high"] as const;

export const BBoxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0).max(1),
    h: z.number().min(0).max(1),
  })
  .strict();
export type BBox = z.infer<typeof BBoxSchema>;

const EndpointSchema = z
  .object({
    // Empty strings mean "not identified"; certainty must then be "unknown".
    componentKey: z.string().max(64),
    terminalLabel: z.string().max(64),
    certainty: z.enum(ENDPOINT_CERTAINTIES),
  })
  .strict();

const ComponentSchema = z
  .object({
    key: z.string().min(1).max(64),
    kind: z.enum(COMPONENT_KINDS),
    label: z.string().min(1).max(120),
    bbox: BBoxSchema,
    confidence: z.number().min(0).max(1),
    evidenceNote: z.string().max(300),
  })
  .strict();

const ConnectionSchema = z
  .object({
    key: z.string().min(1).max(64),
    wireColor: z.string().max(32),
    endpointA: EndpointSchema,
    endpointB: EndpointSchema,
    bbox: BBoxSchema,
    confidence: z.number().min(0).max(1),
    evidenceNote: z.string().max(300),
  })
  .strict();

/** Raw shape the model is asked to emit (validated before anything is persisted). */
export const VisionExtractionSchema = z
  .object({
    sceneQuality: z
      .object({
        lighting: z.enum(QUALITY_LEVELS),
        blur: z.enum(AMOUNT_LEVELS),
        occlusion: z.enum(AMOUNT_LEVELS),
      })
      .strict(),
    components: z.array(ComponentSchema).max(MAX_COMPONENTS),
    connections: z.array(ConnectionSchema).max(MAX_CONNECTIONS),
    uncertainties: z.array(z.string().max(300)).max(20),
  })
  .strict();
export type VisionExtraction = z.infer<typeof VisionExtractionSchema>;
export type VisionComponent = z.infer<typeof ComponentSchema>;
export type VisionConnection = z.infer<typeof ConnectionSchema>;
export type VisionEndpoint = z.infer<typeof EndpointSchema>;

/**
 * JSON Schema sent as response_format. Hand-written with only the keywords
 * Meta's structured-output docs mention (type/properties/required/enum/
 * additionalProperties) so constrained decoding accepts it; numeric ranges
 * are enforced afterwards by the Zod schema above.
 */
const bboxJson = {
  type: "object",
  properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } },
  required: ["x", "y", "w", "h"],
  additionalProperties: false,
};
const endpointJson = {
  type: "object",
  properties: {
    componentKey: { type: "string" },
    terminalLabel: { type: "string" },
    certainty: { type: "string", enum: [...ENDPOINT_CERTAINTIES] },
  },
  required: ["componentKey", "terminalLabel", "certainty"],
  additionalProperties: false,
};
export const VISION_JSON_SCHEMA = {
  type: "object",
  properties: {
    sceneQuality: {
      type: "object",
      properties: {
        lighting: { type: "string", enum: [...QUALITY_LEVELS] },
        blur: { type: "string", enum: [...AMOUNT_LEVELS] },
        occlusion: { type: "string", enum: [...AMOUNT_LEVELS] },
      },
      required: ["lighting", "blur", "occlusion"],
      additionalProperties: false,
    },
    components: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          kind: { type: "string", enum: [...COMPONENT_KINDS] },
          label: { type: "string" },
          bbox: bboxJson,
          confidence: { type: "number" },
          evidenceNote: { type: "string" },
        },
        required: ["key", "kind", "label", "bbox", "confidence", "evidenceNote"],
        additionalProperties: false,
      },
    },
    connections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          wireColor: { type: "string" },
          endpointA: endpointJson,
          endpointB: endpointJson,
          bbox: bboxJson,
          confidence: { type: "number" },
          evidenceNote: { type: "string" },
        },
        required: ["key", "wireColor", "endpointA", "endpointB", "bbox", "confidence", "evidenceNote"],
        additionalProperties: false,
      },
    },
    uncertainties: { type: "array", items: { type: "string" } },
  },
  required: ["sceneQuality", "components", "connections", "uncertainties"],
  additionalProperties: false,
} as const;

export type ValidationIssue = { path: string; message: string };

/**
 * Parse untrusted model JSON and enforce cross-references the JSON schema
 * cannot express. Endpoints that point at unknown components are downgraded
 * to "unknown" rather than trusted.
 */
export function validateVisionExtraction(
  raw: unknown,
): { ok: true; value: VisionExtraction; warnings: ValidationIssue[] } | { ok: false; issues: ValidationIssue[] } {
  const parsed = VisionExtractionSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    };
  }
  const value = parsed.data;
  const warnings: ValidationIssue[] = [];
  const keys = new Set<string>();
  for (const c of [...value.components, ...value.connections]) {
    if (keys.has(c.key)) return { ok: false, issues: [{ path: c.key, message: "duplicate observation key" }] };
    keys.add(c.key);
  }
  const componentKeys = new Set(value.components.map((c) => c.key));
  const connections = value.connections.map((conn) => {
    const fix = (ep: VisionEndpoint, name: string): VisionEndpoint => {
      if (ep.certainty === "unknown") return { componentKey: "", terminalLabel: "", certainty: "unknown" };
      if (!ep.componentKey || !componentKeys.has(ep.componentKey) || !ep.terminalLabel.trim()) {
        warnings.push({ path: `${conn.key}.${name}`, message: "endpoint references no known component/terminal; marked unknown" });
        return { componentKey: "", terminalLabel: "", certainty: "unknown" };
      }
      return { ...ep, terminalLabel: ep.terminalLabel.trim() };
    };
    return { ...conn, endpointA: fix(conn.endpointA, "endpointA"), endpointB: fix(conn.endpointB, "endpointB") };
  });
  return { ok: true, value: { ...value, connections }, warnings };
}
