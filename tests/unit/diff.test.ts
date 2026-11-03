import { describe, expect, it } from "vitest";
import { compareSnapshots } from "@/domain/diff/compare";
import { materializeSnapshot } from "@/domain/graph/materialize";
import { comp, demoRig, ep, unknownEp, wire } from "./helpers";

const graph = (r: ReturnType<typeof demoRig>) => materializeSnapshot(r.components, r.connections);

describe("materializeSnapshot", () => {
  it("does not turn an occluded endpoint into an edge (U-06)", () => {
    const g = materializeSnapshot([comp("a", "c1", "ESP32", 0.1, 0.1)], [wire("a", "w1", "red", ep("c1", "3V3"), unknownEp)]);
    expect(g.edges).toHaveLength(0);
    expect(g.unresolved).toHaveLength(1);
    expect(g.unresolved[0].knownEndpointKey).toBe("esp32:3V3");
  });

  it("normalizes A–B and B–A to one edge (U-09)", () => {
    const c = [comp("a", "c1", "ESP32", 0.1, 0.1), comp("a", "c2", "Driver", 0.5, 0.1)];
    const g = materializeSnapshot(c, [
      wire("a", "w1", "yellow", ep("c1", "GPIO18"), ep("c2", "IN1")),
      wire("a", "w2", "yellow", ep("c2", "IN1"), ep("c1", "gpio 18")),
    ]);
    expect(g.edges).toHaveLength(1);
  });

  it("drops rejected observations", () => {
    const g = materializeSnapshot([comp("a", "c1", "ESP32", 0.1, 0.1, { review: "rejected" })], []);
    expect(g.nodes).toHaveLength(0);
  });

  it("never marks unreviewed wiring as user-confirmed (U-14)", () => {
    const g = graph(demoRig("a"));
    expect(g.edges.every((e) => e.provenance === "VISION_INFERRED")).toBe(true);
  });
});

describe("compareSnapshots", () => {
  it("reports a moved jumper as one connection change", () => {
    const d = compareSnapshots(graph(demoRig("a")), graph(demoRig("b", "GPIO19")));
    expect(d.events).toHaveLength(1);
    const [e] = d.events;
    expect(e.type).toBe("connection_changed");
    expect(e.terminals).toEqual(expect.arrayContaining(["esp32-devkitc:GPIO18", "esp32-devkitc:GPIO19"]));
    expect(e.description).toContain("GPIO18");
    expect(e.description).toContain("GPIO19");
    expect(e.evidence.baseline.length).toBeGreaterThan(0);
    expect(e.evidence.candidate.length).toBeGreaterThan(0);
  });

  it("finds no changes between identical wiring (U-10, U-18)", () => {
    expect(compareSnapshots(graph(demoRig("a")), graph(demoRig("b"))).events).toEqual([]);
    expect(compareSnapshots(materializeSnapshot([], []), materializeSnapshot([], [])).events).toEqual([]);
  });

  it("matches components whose model labels differ by position (U-01 fallback)", () => {
    const b = demoRig("b");
    b.components[0] = comp("b", "c1", "ESP32 development board", 0.11, 0.41);
    const d = compareSnapshots(graph(demoRig("a")), graph(b));
    expect(d.events).toEqual([]);
    expect(d.matchedComponents.find((m) => m.baselineKey === "esp32-devkitc")?.method).toBe("geometry");
  });

  it("reports added and removed components (U-02, U-03)", () => {
    const b = demoRig("b");
    b.components.push(comp("b", "c9", "Buzzer", 0.8, 0.8));
    b.components = b.components.filter((c) => c.key !== "c3");
    b.connections = b.connections.filter((c) => c.key !== "w2");
    const types = compareSnapshots(graph(demoRig("a")), graph(b)).events.map((e) => `${e.type}:${e.entityKind}`);
    expect(types).toEqual(expect.arrayContaining(["added:component", "removed:component", "removed:connection"]));
  });

  it("removal wording admits occlusion (PRD 10.2)", () => {
    const b = demoRig("b");
    b.components = b.components.filter((c) => c.key !== "c3");
    const removed = compareSnapshots(graph(demoRig("a")), graph(b)).events.find((e) => e.type === "removed" && e.entityKind === "component");
    expect(removed?.description).toMatch(/unconfirmed/i);
  });

  it("reports a moved component beyond tolerance (U-04)", () => {
    const b = demoRig("b");
    b.components[2] = comp("b", "c3", "DHT22 sensor", 0.75, 0.6);
    const e = compareSnapshots(graph(demoRig("a")), graph(b)).events;
    expect(e.map((x) => x.type)).toContain("moved");
  });

  it("ignores a shift shared by every part (camera or model box drift)", () => {
    const b = demoRig("b");
    b.components = [comp("b", "c1", "ESP32 DevKitC", 0.108, 0.446), comp("b", "c2", "L9110S motor driver", 0.511, 0.314), comp("b", "c3", "DHT22 sensor", 0.558, 0.664)];
    expect(compareSnapshots(graph(demoRig("a")), graph(b)).events).toEqual([]);
  });

  it("still reports the one part that moved during a shared shift", () => {
    const b = demoRig("b");
    b.components = [comp("b", "c1", "ESP32 DevKitC", 0.108, 0.446), comp("b", "c2", "L9110S motor driver", 0.511, 0.314), comp("b", "c3", "DHT22 sensor", 0.8, 0.664)];
    const moved = compareSnapshots(graph(demoRig("a")), graph(b)).events.filter((e) => e.type === "moved");
    expect(moved.map((e) => e.componentLabels[0])).toEqual(["DHT22 sensor"]);
  });

  it("treats a vanished edge with a now-occluded endpoint as unresolved, not removed", () => {
    const b = demoRig("b");
    b.connections[0] = wire("b", "w1", "yellow", ep("c1", "GPIO18"), unknownEp);
    const [e] = compareSnapshots(graph(demoRig("a")), graph(b)).events;
    expect(e.type).toBe("unresolved");
  });

  it("does not match two same-colour wires by colour alone (U-07, U-11)", () => {
    const comps = (cp: string) => [comp(cp, "c1", "ESP32", 0.1, 0.4), comp(cp, "c2", "Driver", 0.5, 0.25)];
    const a = materializeSnapshot(comps("a"), [
      wire("a", "w1", "red", ep("c1", "GPIO18"), ep("c2", "IN1")),
      wire("a", "w2", "red", ep("c1", "GPIO19"), ep("c2", "IN2")),
    ]);
    // Both red wires change; each new edge shares an endpoint with both old ones.
    const b = materializeSnapshot(comps("b"), [
      wire("b", "w1", "red", ep("c1", "GPIO18"), ep("c2", "IN2")),
      wire("b", "w2", "red", ep("c1", "GPIO19"), ep("c2", "IN1")),
    ]);
    const events = compareSnapshots(a, b).events;
    expect(events.some((e) => e.type === "unresolved")).toBe(true);
    expect(events.some((e) => e.type === "connection_changed")).toBe(false);
  });

  it("produces identical output for reordered input (U-08)", () => {
    const a = demoRig("a");
    const b = demoRig("b", "GPIO19");
    const d1 = compareSnapshots(graph(a), graph(b));
    const d2 = compareSnapshots(
      materializeSnapshot([...a.components].reverse(), [...a.connections].reverse()),
      materializeSnapshot([...b.components].reverse(), [...b.connections].reverse()),
    );
    expect(d2).toEqual(d1);
  });

  it("marks a change user-confirmed only when both sides were confirmed", () => {
    const a = demoRig("a");
    const b = demoRig("b", "GPIO19");
    a.connections[0].endpointsConfirmed = true;
    expect(compareSnapshots(graph(a), graph(b)).events[0].provenance).toBe("VISION_INFERRED");
    b.connections[0].endpointsConfirmed = true;
    expect(compareSnapshots(graph(a), graph(b)).events[0].provenance).toBe("USER_CONFIRMED");
  });
});
