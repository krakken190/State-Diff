import { MODULE_PINS, MODULE_TITLES, SCENE_HEIGHT, SCENE_WIDTH, type ModuleKind, type PinRef, type Scene, type SceneModule, type WireColor } from "./scene";

/**
 * Renders a scene as an SVG that resembles an overhead workbench photo.
 * Deliberately legible (large silkscreen labels, distinct wire colors) —
 * the PRD's recommended demo setup — but with lighting/camera variation so
 * consecutive shots are not pixel-identical.
 */

const SIZES: Record<ModuleKind, { w: number; h: number }> = {
  esp32: { w: 300, h: 760 },
  motor_driver: { w: 270, h: 230 },
  dht22: { w: 210, h: 230 },
  motor: { w: 220, h: 160 },
};

const WIRE_RGB: Record<WireColor, { base: string; hi: string }> = {
  red: { base: "#c81e1e", hi: "#ff6b6b" },
  black: { base: "#1b1b1b", hi: "#5a5a5a" },
  yellow: { base: "#e3b80b", hi: "#fff07a" },
  blue: { base: "#1f5fd1", hi: "#7fb0ff" },
  green: { base: "#1d8f3a", hi: "#6fe08e" },
  orange: { base: "#e06a12", hi: "#ffb26b" },
  white: { base: "#d9d9d9", hi: "#ffffff" },
};

export function pinPosition(scene: Scene, ref: PinRef): { x: number; y: number; side: "left" | "right" } {
  const mod = scene.modules.find((m) => m.id === ref.module);
  if (!mod) throw new Error(`unknown module ${ref.module}`);
  const pins = MODULE_PINS[mod.kind];
  const idx = pins.indexOf(ref.pin);
  if (idx < 0) throw new Error(`unknown pin ${ref.pin} on ${mod.kind}`);
  if (mod.kind === "esp32") return { x: mod.x + 268, y: mod.y + 70 + idx * 50, side: "right" };
  return { x: mod.x + 22, y: mod.y + 62 + idx * 46, side: "left" };
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10_000) / 10_000;
  };
}

function esc(t: string) {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

function headerPin(x: number, y: number) {
  return `<rect x="${x - 9}" y="${y - 9}" width="18" height="18" rx="2" fill="#151515"/>
  <rect x="${x - 4}" y="${y - 4}" width="8" height="8" fill="url(#gold)"/>`;
}

function renderModule(scene: Scene, mod: SceneModule): string {
  const { w, h } = SIZES[mod.kind];
  const pins = MODULE_PINS[mod.kind];
  const title = MODULE_TITLES[mod.kind];
  const g: string[] = [];
  const at = (s: string) => `<g transform="translate(${mod.x},${mod.y})">${s}</g>`;

  if (mod.kind === "esp32") {
    g.push(`<rect width="${w}" height="${h}" rx="10" fill="#1d2430" filter="url(#shadow)"/>`);
    g.push(`<rect x="48" y="40" width="112" height="170" rx="4" fill="#9aa3ad" stroke="#c9d0d6" stroke-width="3"/>`);
    g.push(`<text x="104" y="120" font-family="Arial" font-size="14" font-weight="bold" fill="#3b4148" text-anchor="middle">ESP32-WROOM</text>`);
    g.push(`<text x="104" y="140" font-family="Arial" font-size="12" fill="#3b4148" text-anchor="middle">-32</text>`);
    g.push(`<rect x="110" y="${h - 22}" width="80" height="30" rx="4" fill="#b8bec4"/>`);
    g.push(`<text x="104" y="${h - 260}" font-family="Arial" font-size="15" fill="#e8edf2" text-anchor="middle" transform="rotate(-90 104 ${h - 260})">${esc(title)}</text>`);
    pins.forEach((p, i) => {
      const y = 70 + i * 50;
      g.push(headerPin(268, y));
      g.push(`<text x="248" y="${y + 7}" font-family="Consolas, DejaVu Sans Mono, monospace" font-size="21" font-weight="bold" fill="#f2f2f2" text-anchor="end">${esc(p)}</text>`);
      g.push(headerPin(28, y));
    });
    return at(g.join(""));
  }
  if (mod.kind === "motor") {
    g.push(`<rect x="0" y="30" width="150" height="100" rx="12" fill="url(#metal)" filter="url(#shadow)"/>`);
    g.push(`<rect x="150" y="62" width="50" height="36" fill="#d6d6d6"/><rect x="200" y="74" width="20" height="12" fill="#bdbdbd"/>`);
    g.push(`<text x="75" y="88" font-family="Arial" font-size="16" fill="#333" text-anchor="middle">DC MOTOR</text>`);
    return at(g.join(""));
  }
  const pcb = mod.kind === "motor_driver" ? "#b3202a" : "#f4f4f0";
  const ink = mod.kind === "motor_driver" ? "#ffffff" : "#222222";
  g.push(`<rect width="${w}" height="${h}" rx="8" fill="${pcb}" filter="url(#shadow)"/>`);
  if (mod.kind === "dht22") {
    for (let r = 0; r < 6; r++) g.push(`<rect x="90" y="${30 + r * 28}" width="100" height="14" rx="3" fill="#dcdcd6"/>`);
  } else {
    g.push(`<rect x="120" y="60" width="60" height="44" fill="#222"/><rect x="120" y="130" width="60" height="44" fill="#222"/>`);
    g.push(`<rect x="215" y="70" width="40" height="90" rx="3" fill="#2a7de1"/>`);
  }
  g.push(`<text x="${w / 2}" y="${h - 14}" font-family="Arial" font-size="18" font-weight="bold" fill="${ink}" text-anchor="middle">${esc(title)}</text>`);
  pins.forEach((p, i) => {
    const y = 62 + i * 46;
    g.push(headerPin(22, y));
    g.push(`<text x="40" y="${y + 7}" font-family="Consolas, DejaVu Sans Mono, monospace" font-size="20" font-weight="bold" fill="${ink}">${esc(p)}</text>`);
  });
  return at(g.join(""));
}

function renderBreadboard(): string {
  const x = 600, y = 150, w = 880, h = 660;
  const holes: string[] = [];
  for (let c = 0; c < 30; c++) {
    for (let r = 0; r < 10; r++) {
      const hx = x + 50 + c * 27;
      const hy = y + 120 + r * 38 + (r >= 5 ? 40 : 0);
      holes.push(`<rect x="${hx}" y="${hy}" width="7" height="7" fill="#3c3c3c"/>`);
    }
    if (c % 5 === 0) holes.push(`<text x="${x + 53 + c * 27}" y="${y + 108}" font-family="Arial" font-size="11" fill="#888" text-anchor="middle">${c + 1}</text>`);
  }
  const rail = (ry: number) =>
    `<line x1="${x + 40}" y1="${ry}" x2="${x + w - 40}" y2="${ry}" stroke="#d33" stroke-width="2"/>
     <line x1="${x + 40}" y1="${ry + 44}" x2="${x + w - 40}" y2="${ry + 44}" stroke="#36c" stroke-width="2"/>`;
  return `<g filter="url(#shadow)"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#f1efe6"/></g>
    ${rail(y + 26)}${rail(y + h - 74)}
    <rect x="${x + 30}" y="${y + 312}" width="${w - 60}" height="16" fill="#e3e0d4"/>
    ${holes.join("")}`;
}

function renderWire(scene: Scene, from: PinRef, to: PinRef, color: WireColor, jitter: () => number): string {
  const a = pinPosition(scene, from);
  const b = pinPosition(scene, to);
  const dx = Math.max(120, Math.abs(b.x - a.x) * 0.45);
  const c1x = a.x + (a.side === "right" ? dx : -dx);
  const c2x = b.x + (b.side === "right" ? dx : -dx);
  const sag = 30 + jitter() * 40;
  const d = `M ${a.x} ${a.y} C ${c1x} ${a.y + sag} ${c2x} ${b.y - sag} ${b.x} ${b.y}`;
  const { base, hi } = WIRE_RGB[color];
  return `<g filter="url(#wireShadow)">
    <path d="${d}" fill="none" stroke="${base}" stroke-width="11" stroke-linecap="round"/>
    <path d="${d}" fill="none" stroke="${hi}" stroke-width="3" stroke-linecap="round" opacity="0.55" transform="translate(-2,-2)"/>
  </g>
  <rect x="${a.x - 11}" y="${a.y - 11}" width="22" height="22" rx="3" fill="#111"/>
  <rect x="${b.x - 11}" y="${b.y - 11}" width="22" height="22" rx="3" fill="#111"/>`;
}

export function renderSceneSvg(scene: Scene): string {
  const r = rng(scene.shotSeed);
  // Small, plausible handheld-camera variation between shots.
  const rot = (r() - 0.5) * 1.2;
  const tx = (r() - 0.5) * 24;
  const ty = (r() - 0.5) * 18;
  const light = 0.9 + r() * 0.2;
  const lightX = 30 + r() * 40;

  const modules = scene.modules.map((m) => renderModule(scene, m)).join("");
  const motorDriver = scene.modules.find((m) => m.kind === "motor_driver");
  const motor = scene.modules.find((m) => m.kind === "motor");
  // Motor leads are fixed scenery (not part of the jumper wire model).
  const motorLeads =
    motorDriver && motor
      ? `<path d="M ${motorDriver.x + 255} ${motorDriver.y + 95} C ${motor.x - 40} ${motorDriver.y + 95} ${motor.x - 60} ${motor.y + 80} ${motor.x} ${motor.y + 80}" stroke="#c81e1e" stroke-width="6" fill="none"/>
         <path d="M ${motorDriver.x + 255} ${motorDriver.y + 135} C ${motor.x - 30} ${motorDriver.y + 135} ${motor.x - 50} ${motor.y + 100} ${motor.x} ${motor.y + 100}" stroke="#1b1b1b" stroke-width="6" fill="none"/>`
      : "";
  const wires = scene.wires.map((w) => renderWire(scene, w.from, w.to, w.color, r)).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SCENE_WIDTH}" height="${SCENE_HEIGHT}" viewBox="0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}">
  <defs>
    <filter id="wood" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.004 0.09" numOctaves="3" seed="${scene.shotSeed % 97}"/>
      <feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.38  0 0 0 0 0.22  0 0 0 0.55 0"/>
      <feComposite in2="SourceGraphic" operator="over"/>
    </filter>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="${scene.shotSeed}"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.10 0"/>
    </filter>
    <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%"><feDropShadow dx="6" dy="9" stdDeviation="7" flood-opacity="0.45"/></filter>
    <filter id="wireShadow" x="-5%" y="-5%" width="115%" height="115%"><feDropShadow dx="4" dy="6" stdDeviation="3" flood-opacity="0.4"/></filter>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f5d77a"/><stop offset="1" stop-color="#a7801f"/></linearGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2e2e2"/><stop offset="0.5" stop-color="#a9a9a9"/><stop offset="1" stop-color="#d0d0d0"/></linearGradient>
    <radialGradient id="lamp" cx="${lightX}%" cy="35%" r="80%"><stop offset="0" stop-color="#fff6e0" stop-opacity="${0.18 * light}"/><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="#7a5233" filter="url(#wood)"/>
  <g transform="translate(${tx.toFixed(1)},${ty.toFixed(1)}) rotate(${rot.toFixed(2)} 800 550)">
    ${renderBreadboard()}
    ${modules}
    ${motorLeads}
    ${wires}
  </g>
  <rect width="100%" height="100%" fill="url(#lamp)"/>
  <rect width="100%" height="100%" filter="url(#grain)"/>
</svg>`;
}
