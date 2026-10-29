import type { EffectiveComponent, EffectiveConnection, EffectiveEndpoint } from "@/domain/graph/materialize";

let n = 0;
const ev = (cp: string) => ({ checkpointId: cp, captureId: `cap-${cp}`, observationId: `obs-${++n}` });

export function comp(cp: string, key: string, label: string, x: number, y: number, extra: Partial<EffectiveComponent> = {}): EffectiveComponent {
  return { observationId: `o-${cp}-${key}`, key, kind: "board", label, bbox: { x, y, w: 0.1, h: 0.1 }, confidence: 0.9, review: "pending", evidence: ev(cp), ...extra };
}

export const ep = (componentKey: string, terminalLabel: string): EffectiveEndpoint => ({ componentKey, terminalLabel, certainty: "visible" });
export const unknownEp: EffectiveEndpoint = { componentKey: "", terminalLabel: "", certainty: "unknown" };

export function wire(cp: string, key: string, color: string, a: EffectiveEndpoint, b: EffectiveEndpoint, extra: Partial<EffectiveConnection> = {}): EffectiveConnection {
  return { observationId: `o-${cp}-${key}`, key, wireColor: color, endpointA: a, endpointB: b, confidence: 0.8, review: "pending", endpointsConfirmed: false, evidence: ev(cp), ...extra };
}

/** The demo rig's baseline wiring as reviewed observations. */
export function demoRig(cp: string, yellowFrom = "GPIO18") {
  const components = [
    comp(cp, "c1", "ESP32 DevKitC", 0.1, 0.4),
    comp(cp, "c2", "L9110S motor driver", 0.5, 0.25),
    comp(cp, "c3", "DHT22 sensor", 0.55, 0.6),
  ];
  const connections = [
    wire(cp, "w1", "yellow", ep("c1", yellowFrom), ep("c2", "IN1")),
    wire(cp, "w2", "blue", ep("c1", "GPIO4"), ep("c3", "DATA")),
    wire(cp, "w3", "black", ep("c1", "GND"), ep("c2", "GND")),
  ];
  return { components, connections };
}
