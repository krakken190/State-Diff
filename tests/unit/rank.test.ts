import { describe, expect, it } from "vitest";
import { compareSnapshots } from "@/domain/diff/compare";
import { materializeSnapshot } from "@/domain/graph/materialize";
import { parsePinMap, rankSuspects, testTransitionWeight } from "@/domain/investigation/rank";
import { demoRig } from "./helpers";

const pinMap = parsePinMap("MOTOR_PIN = GPIO18 -> L9110S IN1\nDHT_PIN: GPIO4 (DHT22 data)");
const moved = () => {
  const a = demoRig("a");
  const b = demoRig("b", "GPIO19");
  return compareSnapshots(materializeSnapshot(a.components, a.connections), materializeSnapshot(b.components, b.connections)).events;
};
const regression = [
  { name: "motor_test", before: "pass" as const, after: "fail" as const },
  { name: "sensor_test", before: "pass" as const, after: "pass" as const },
];
const codeChanges = [{ path: "src/config.h", changedLines: ["-#define LOG_INTERVAL_MS 1000", "+#define LOG_INTERVAL_MS 250"] }];

describe("parsePinMap", () => {
  it("reads NAME = GPIOn lines", () => {
    expect(pinMap).toEqual([
      { name: "MOTOR_PIN", pin: "GPIO18", description: "L9110S IN1" },
      { name: "DHT_PIN", pin: "GPIO4", description: "(DHT22 data)" },
    ]);
  });
});

describe("rankSuspects", () => {
  it("ranks the moved motor jumper above an unrelated code change (PRD 11.4)", () => {
    const s = rankSuspects({ events: moved(), transitions: regression, codeChanges, pinMap });
    expect(s[0].kind).toBe("physical");
    expect(s[0].title).toBe("Possible jumper relocation");
    expect(s[0].relatedTests).toEqual(["motor_test"]);
    expect(s[0].suggestedCheck).toContain("GPIO18");
    expect(s[1].kind).toBe("code");
    expect(s[0].score).toBeGreaterThan(s[1].score);
  });

  it("is deterministic for identical input (U-19)", () => {
    const input = { events: moved(), transitions: regression, codeChanges, pinMap };
    expect(rankSuspects(input)).toEqual(rankSuspects(input));
  });

  it("keeps scores bounded in [0,1] and explains every factor", () => {
    for (const s of rankSuspects({ events: moved(), transitions: regression, codeChanges, pinMap })) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(1);
      expect(s.breakdown.reasons.length).toBeGreaterThan(1);
    }
  });

  it("does not treat missing test evidence as a regression (U-15)", () => {
    expect(testTransitionWeight([]).weight).toBe(0.5);
    expect(testTransitionWeight([{ name: "motor_test", before: "unknown", after: "fail" }]).weight).toBe(0.5);
  });

  it("produces no physical suspects for a code-only change (U-18)", () => {
    const s = rankSuspects({ events: [], transitions: regression, codeChanges, pinMap });
    expect(s.every((x) => x.kind === "code")).toBe(true);
  });

  it("flags unconfirmed AI observations in the explanation", () => {
    const [top] = rankSuspects({ events: moved(), transitions: regression, codeChanges: [], pinMap });
    expect(top.explanation).toMatch(/cannot verify electrical continuity/);
    expect(top.uncertainty).toBe("medium");
  });
});
