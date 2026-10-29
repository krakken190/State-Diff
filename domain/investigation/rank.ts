import type { DiffEvent } from "../diff/compare";
import { normalizePin } from "../graph/types";

export const RANKING_VERSION = "rank-v1";

export type TestStatus = "pass" | "fail" | "error" | "skipped" | "unknown";
export type TestTransition = { name: string; before: TestStatus; after: TestStatus };

export type CodeChange = {
  path: string;
  /** Changed lines (opt-in patch content); may be empty when only file names were shared. */
  changedLines: string[];
};

/** Parsed from the project's optional pin map, e.g. "MOTOR_PIN = GPIO18 -> L9110S IN1". */
export type PinAssignment = { name: string; pin: string; description: string };

export type ScoreBreakdown = {
  evidenceStrength: number;
  changeRelevance: number;
  testTransitionWeight: number;
  provenanceWeight: number;
  reasons: string[];
};

export type Suspect = {
  kind: "physical" | "code";
  title: string;
  explanation: string;
  suggestedCheck: string;
  score: number;
  breakdown: ScoreBreakdown;
  uncertainty: "low" | "medium" | "high";
  /** Diff event keys (physical) or file paths (code) this suspect rests on. */
  evidenceKeys: string[];
  relatedTests: string[];
};

const EVENT_STRENGTH: Record<DiffEvent["type"], number> = {
  connection_changed: 1.0,
  removed: 0.8,
  attribute_changed: 0.7,
  added: 0.6,
  unresolved: 0.5,
  moved: 0.4,
};

export function regressions(transitions: readonly TestTransition[]) {
  return transitions.filter((t) => t.before === "pass" && (t.after === "fail" || t.after === "error"));
}

export function testTransitionWeight(transitions: readonly TestTransition[]): { weight: number; reason: string } {
  if (regressions(transitions).length > 0) return { weight: 1, reason: "a test changed from PASS to FAIL across this change" };
  if (transitions.length === 0 || transitions.every((t) => t.before === "unknown" || t.after === "unknown"))
    return { weight: 0.5, reason: "no comparable test evidence" };
  return { weight: 0.2, reason: "no test regressed" };
}

/** Tokens that tie a test to hardware, e.g. "motor_test" → ["motor"]. */
export function testTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !["test", "tests", "spec", "check", "the"].includes(t));
}

export function parsePinMap(text: string | null | undefined): PinAssignment[] {
  if (!text) return [];
  const out: PinAssignment[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z][\w ]{0,40}?)\s*[:=]\s*((?:GPIO|IO|D)\s*\d{1,2})\b(.*)$/i);
    if (m) out.push({ name: m[1].trim(), pin: normalizePin(m[2]), description: m[3].replace(/^[\s\-–>:]+/, "").trim() });
  }
  return out;
}

function pinOf(terminalKey: string) {
  return terminalKey.slice(terminalKey.lastIndexOf(":") + 1);
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Deterministic, explainable suspect ranking. The score orders what to
 * inspect first; it is not a probability that the change caused the failure.
 */
export function rankSuspects(input: {
  events: readonly DiffEvent[];
  transitions: readonly TestTransition[];
  codeChanges: readonly CodeChange[];
  pinMap: readonly PinAssignment[];
}): Suspect[] {
  const transition = testTransitionWeight(input.transitions);
  const failing = regressions(input.transitions);
  const failingTokens = [...new Set(failing.flatMap((t) => testTokens(t.name)))];
  const suspects: Suspect[] = [];

  for (const ev of input.events) {
    const reasons: string[] = [transition.reason];
    const haystack = [...ev.componentLabels, ev.description].join(" ").toLowerCase();
    const tokenHit = failingTokens.find((t) => haystack.includes(t));
    const pins = new Set(ev.terminals.map(pinOf));
    const pinHits = input.pinMap.filter((p) => pins.has(p.pin));
    const pinHitRelevant = pinHits.find((p) => failingTokens.some((t) => `${p.name} ${p.description}`.toLowerCase().includes(t)));

    let relevance = 0.5;
    if (pinHitRelevant) {
      relevance = 1;
      reasons.push(`touches ${pinHitRelevant.pin}, assigned to ${pinHitRelevant.name} in the project pin map`);
    } else if (tokenHit) {
      relevance = 0.85;
      reasons.push(`involves a part matching the failing test ("${tokenHit}")`);
    } else if (pinHits.length > 0) {
      relevance = 0.7;
      reasons.push(`touches pin-mapped ${pinHits.map((p) => p.pin).join(", ")}`);
    } else if (failing.length > 0) {
      relevance = 0.35;
      reasons.push("no link to the failing test found");
    }

    const strength = EVENT_STRENGTH[ev.type];
    const provenanceWeight = ev.provenance === "USER_CONFIRMED" ? 1 : 0.7;
    reasons.push(ev.provenance === "USER_CONFIRMED" ? "endpoints confirmed by you" : "based on AI observation, not yet confirmed");
    const score = round(strength * relevance * transition.weight * provenanceWeight);

    const relatedTests = failing.filter((t) => testTokens(t.name).some((tok) => haystack.includes(tok)) || pinHitRelevant).map((t) => t.name);
    suspects.push({
      kind: "physical",
      title: physicalTitle(ev),
      explanation: physicalExplanation(ev, pinHitRelevant, failing),
      suggestedCheck: physicalCheck(ev, pinHitRelevant),
      score,
      breakdown: { evidenceStrength: strength, changeRelevance: relevance, testTransitionWeight: transition.weight, provenanceWeight, reasons },
      uncertainty: ev.provenance === "USER_CONFIRMED" && ev.type !== "unresolved" ? "low" : ev.type === "unresolved" ? "high" : "medium",
      evidenceKeys: [ev.key],
      relatedTests,
    });
  }

  for (const change of input.codeChanges) {
    const reasons: string[] = [transition.reason];
    const text = [change.path, ...change.changedLines].join("\n").toLowerCase();
    const tokenHit = failingTokens.find((t) => text.includes(t));
    const mentionedPins = input.pinMap.filter((p) => text.includes(p.name.toLowerCase()) || text.includes(p.pin.toLowerCase()));
    let relevance = 0.4;
    if (tokenHit) {
      relevance = 0.85;
      reasons.push(`changed lines mention "${tokenHit}"`);
    } else if (mentionedPins.length > 0) {
      relevance = 0.6;
      reasons.push(`mentions pin-mapped ${mentionedPins.map((p) => p.name).join(", ")}`);
    } else if (change.changedLines.length === 0) {
      reasons.push("only the file name was shared; contents not inspected");
    } else {
      relevance = 0.3;
      reasons.push("changed lines show no link to the failing test");
    }
    const strength = change.changedLines.length > 0 ? 0.8 : 0.5;
    const provenanceWeight = 1; // Git metadata is observed, not inferred.
    reasons.push("observed in Git");
    suspects.push({
      kind: "code",
      title: `Code change in ${change.path}`,
      explanation:
        change.changedLines.length > 0
          ? `Changed: ${change.changedLines.slice(0, 3).join(" · ")}${change.changedLines.length > 3 ? " …" : ""}`
          : "This file changed between the two checkpoints.",
      suggestedCheck: tokenHit
        ? `Review the change against the failing ${failing.map((t) => t.name).join(", ")}.`
        : "Confirm this change is unrelated before ruling it out.",
      score: round(strength * relevance * transition.weight * provenanceWeight),
      breakdown: { evidenceStrength: strength, changeRelevance: relevance, testTransitionWeight: transition.weight, provenanceWeight, reasons },
      uncertainty: change.changedLines.length > 0 ? "medium" : "high",
      evidenceKeys: [change.path],
      relatedTests: tokenHit ? failing.map((t) => t.name) : [],
    });
  }

  // Deterministic order: score desc, physical before code, then evidence key.
  return suspects.sort(
    (a, b) => b.score - a.score || (a.kind === b.kind ? 0 : a.kind === "physical" ? -1 : 1) || a.evidenceKeys[0].localeCompare(b.evidenceKeys[0]),
  );
}

function physicalTitle(ev: DiffEvent): string {
  switch (ev.type) {
    case "connection_changed":
      return "Possible jumper relocation";
    case "removed":
      return ev.entityKind === "connection" ? "Jumper no longer visible" : "Part no longer visible";
    case "added":
      return ev.entityKind === "connection" ? "New jumper visible" : "New part visible";
    case "moved":
      return "Part appears moved";
    case "attribute_changed":
      return "Confirmed attribute changed";
    case "unresolved":
      return "Unresolved visual change";
  }
}

function physicalExplanation(ev: DiffEvent, pin: PinAssignment | undefined, failing: TestTransition[]): string {
  const parts = [ev.description];
  if (pin) parts.push(`The project pin map assigns ${pin.pin} to ${pin.name}${pin.description ? ` (${pin.description})` : ""}.`);
  if (failing.length > 0) parts.push(`${failing.map((t) => t.name).join(", ")} changed from PASS to FAIL across this change.`);
  if (ev.provenance !== "USER_CONFIRMED") parts.push("This comes from image analysis; a photo cannot verify electrical continuity.");
  return parts.join(" ");
}

function physicalCheck(ev: DiffEvent, pin: PinAssignment | undefined): string {
  if (ev.type === "connection_changed" && pin) return `Check that the ${pin.name} signal wire sits on ${pin.pin} as the firmware expects.`;
  if (ev.type === "connection_changed") return "Inspect this jumper's endpoints against your intended wiring.";
  if (ev.type === "removed") return "Check whether this item was removed or is just hidden from the camera.";
  if (ev.type === "unresolved") return "Retake the photo with this area visible, or confirm the endpoint manually.";
  return "Inspect this area of the board.";
}
