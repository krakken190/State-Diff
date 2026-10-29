/**
 * Opt-in live Meta Model API smoke test (costs a few cents).
 *   pnpm smoke:meta [image.jpg]
 * 1. GET /models — confirms the key works and lists available model ids (incl. the SAM id).
 * 2. Sends one demo bench photo for structured extraction and validates it.
 * A successful extraction is recorded under data/recordings for replay mode.
 */
import fs from "node:fs";
import path from "node:path";

for (const f of [".env.local", ".env"]) if (fs.existsSync(f)) process.loadEnvFile(f);

async function main() {
  const { env } = await import("@/lib/env");
  const { extractObservations } = await import("@/lib/vision/provider");
  const { sha256 } = await import("@/lib/images");
  const sharp = (await import("sharp")).default;
  const e = env();
  if (!e.MODEL_API_KEY) throw new Error("MODEL_API_KEY is not set in .env.local");

  console.log(`1) GET ${e.META_MODEL_BASE_URL}/models`);
  const res = await fetch(`${e.META_MODEL_BASE_URL}/models`, { headers: { Authorization: `Bearer ${e.MODEL_API_KEY}` } });
  console.log(`   HTTP ${res.status}`);
  const models = (await res.json()) as { data?: { id: string }[] };
  const ids = models.data?.map((m) => m.id) ?? [];
  console.log(`   models: ${ids.join(", ") || JSON.stringify(models).slice(0, 300)}`);
  console.log(`   vision model ${e.META_VISION_MODEL}: ${ids.includes(e.META_VISION_MODEL) ? "available" : "NOT LISTED"}`);
  console.log(`   SAM ids listed: ${ids.filter((i) => i.toLowerCase().includes("sam")).join(", ") || "none"}`);

  const imagePath = process.argv[2] ?? path.join("demo", "images", "a-baseline.jpg");
  // Same normalization as the upload pipeline so the recording matches app uploads byte-for-byte.
  const bytes = await sharp(fs.readFileSync(imagePath)).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  console.log(`2) extraction on ${imagePath} (${bytes.length} bytes) with ${process.env.SMOKE_MODEL ?? e.META_VISION_MODEL}`);
  const result = await extractObservations({ imageBytes: bytes, mimeType: "image/jpeg", inputSha256: sha256(bytes), hardwareContext: "ESP32 DevKitC, L9110S motor driver, DHT22 sensor", model: process.env.SMOKE_MODEL ?? e.META_VISION_MODEL });
  console.log(`   meta: ${JSON.stringify(result.meta)}`);
  if (!result.ok) {
    console.log(`   FAILED ${result.errorCode}: ${result.message}`);
    if (result.rawContent) console.log(`   raw: ${result.rawContent.slice(0, 1500)}`);
    process.exit(1);
  }
  console.log(`   components (${result.extraction.components.length}):`);
  for (const c of result.extraction.components) console.log(`     - ${c.key} ${c.kind} "${c.label}" conf=${c.confidence}`);
  console.log(`   connections (${result.extraction.connections.length}):`);
  for (const c of result.extraction.connections)
    console.log(`     - ${c.wireColor}: ${c.endpointA.componentKey}:${c.endpointA.terminalLabel} (${c.endpointA.certainty}) <-> ${c.endpointB.componentKey}:${c.endpointB.terminalLabel} (${c.endpointB.certainty})`);
  if (result.warnings.length) console.log(`   warnings: ${result.warnings.map((w) => w.message).join("; ")}`);
  console.log(`   uncertainties: ${result.extraction.uncertainties.join(" | ") || "none"}`);
}

main().catch((err) => {
  console.error(`smoke:meta failed: ${(err as Error).message}`);
  process.exit(1);
});
