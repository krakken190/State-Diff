/**
 * Simulated rig scene model. A scene is the ground truth for one physical
 * state of the demo bench: which modules exist and which header pins each
 * jumper connects. The renderer turns it into a photo-like image; the
 * simulated test reads it as if probing the real hardware. The vision
 * pipeline never sees this file — only the rendered image.
 */
export type PinRef = { module: string; pin: string };

export type Wire = { id: string; color: WireColor; from: PinRef; to: PinRef };

export type WireColor = "red" | "black" | "yellow" | "blue" | "green" | "orange" | "white";

export type ModuleKind = "esp32" | "motor_driver" | "dht22" | "motor";

export type SceneModule = {
  id: string;
  kind: ModuleKind;
  /** Top-left position in scene pixels. */
  x: number;
  y: number;
};

export type Scene = {
  id: string;
  description: string;
  /** Seed for photographic variation (lighting, slight camera shift). */
  shotSeed: number;
  modules: SceneModule[];
  wires: Wire[];
};

export const SCENE_WIDTH = 1600;
export const SCENE_HEIGHT = 1100;

/** Pin order per module kind; geometry is derived in the renderer. */
export const MODULE_PINS: Record<ModuleKind, string[]> = {
  esp32: ["VIN", "GND", "GPIO23", "GPIO22", "GPIO21", "GPIO19", "GPIO18", "GPIO5", "GPIO17", "GPIO16", "GPIO4", "GPIO2", "GPIO15", "3V3"],
  motor_driver: ["VCC", "GND", "IN1", "IN2"],
  dht22: ["VCC", "DATA", "NC", "GND"],
  motor: [],
};

export const MODULE_TITLES: Record<ModuleKind, string> = {
  esp32: "ESP32-DevKitC",
  motor_driver: "L9110S",
  dht22: "DHT22",
  motor: "DC motor",
};

export function connectedPins(scene: Scene, a: PinRef): PinRef[] {
  const key = (p: PinRef) => `${p.module}:${p.pin}`;
  return scene.wires
    .filter((w) => key(w.from) === key(a) || key(w.to) === key(a))
    .map((w) => (key(w.from) === key(a) ? w.to : w.from));
}
