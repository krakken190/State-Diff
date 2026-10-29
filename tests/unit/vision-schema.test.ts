import { describe, expect, it } from "vitest";
import { isGenericTerminalLabel, validateVisionExtraction } from "@/schemas/vision";

const box = { x: 0.1, y: 0.1, w: 0.1, h: 0.1 };
const extraction = (endpointLabel: string) => ({
  sceneQuality: { lighting: "good", blur: "low", occlusion: "low" },
  components: [
    { key: "drv", kind: "module", label: "L9110S", bbox: box, confidence: 0.9, evidenceNote: "" },
    { key: "motor", kind: "component", label: "DC MOTOR", bbox: box, confidence: 0.9, evidenceNote: "" },
  ],
  connections: [
    {
      key: "w1",
      wireColor: "red",
      endpointA: { componentKey: "drv", terminalLabel: endpointLabel, certainty: "inferred" },
      endpointB: { componentKey: "motor", terminalLabel: "terminal", certainty: "inferred" },
      bbox: box,
      confidence: 0.6,
      evidenceNote: "",
    },
  ],
  uncertainties: [],
});

describe("isGenericTerminalLabel", () => {
  it("flags names invented for unlabelled pins", () => {
    for (const l of ["output", "motor output", "Motor Terminal 2", "terminal", "pin", "unknown", "?", "unlabeled"]) expect(isGenericTerminalLabel(l)).toBe(true);
  });

  it("keeps real silkscreen labels", () => {
    for (const l of ["IN1", "OUT1", "GPIO18", "GND", "3V3", "VCC", "DATA", "OA", "row 12"]) expect(isGenericTerminalLabel(l)).toBe(false);
  });
});

describe("validateVisionExtraction", () => {
  it("downgrades invented pin names to unknown endpoints with a warning", () => {
    const r = validateVisionExtraction(extraction("motor output"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.connections[0].endpointA.certainty).toBe("unknown");
    expect(r.value.connections[0].endpointB.certainty).toBe("unknown");
    expect(r.warnings).toHaveLength(2);
  });

  it("keeps printed labels", () => {
    const r = validateVisionExtraction(extraction("OA"));
    expect(r.ok && r.value.connections[0].endpointA.terminalLabel).toBe("OA");
  });

  it("rejects out-of-range bounding boxes", () => {
    const bad = extraction("OA");
    bad.components[0].bbox = { x: 1.5, y: 0, w: 0.1, h: 0.1 };
    expect(validateVisionExtraction(bad).ok).toBe(false);
  });
});
