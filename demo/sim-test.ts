import { connectedPins, type Scene } from "./scene";

/**
 * Simulated hardware-in-the-loop tests for the demo rig. They stand in for
 * a real test script that would toggle a GPIO and watch the driver input:
 * here "probing" means reading the scene's ground-truth wiring. Results are
 * labelled source "simulated" everywhere they are shown.
 */
export type FirmwareConfig = { motorPin: number; dhtPin: number };

export type SimTestResult = {
  name: string;
  status: "pass" | "fail";
  exitCode: number;
  durationMs: number;
  output: string;
};

export function parseFirmwareConfig(configH: string): FirmwareConfig {
  const read = (name: string) => {
    const m = configH.match(new RegExp(`#define\\s+${name}\\s+(\\d+)`));
    if (!m) throw new Error(`config.h is missing #define ${name}`);
    return Number(m[1]);
  };
  return { motorPin: read("MOTOR_PIN"), dhtPin: read("DHT_PIN") };
}

function isWired(scene: Scene, espPin: string, module: string, pin: string) {
  return connectedPins(scene, { module: "esp32", pin: espPin }).some((p) => p.module === module && p.pin === pin);
}

export function runSimTests(scene: Scene, fw: FirmwareConfig): SimTestResult[] {
  const motorGpio = `GPIO${fw.motorPin}`;
  const motorOk = isWired(scene, motorGpio, "driver", "IN1");
  const dhtGpio = `GPIO${fw.dhtPin}`;
  const dhtOk = isWired(scene, dhtGpio, "dht", "DATA") && isWired(scene, "3V3", "dht", "VCC");
  return [
    {
      name: "motor_test",
      status: motorOk ? "pass" : "fail",
      exitCode: motorOk ? 0 : 1,
      durationMs: 1840,
      output: motorOk
        ? `[sim] toggled ${motorGpio} at 1 kHz; driver IN1 followed (duty 50% ±2%). motor spun up. PASS`
        : `[sim] toggled ${motorGpio} at 1 kHz; driver IN1 stayed LOW for 1500 ms. motor did not spin. FAIL`,
    },
    {
      name: "sensor_test",
      status: dhtOk ? "pass" : "fail",
      exitCode: dhtOk ? 0 : 1,
      durationMs: 2210,
      output: dhtOk
        ? `[sim] DHT22 on ${dhtGpio} responded: 23.4 C, 41% RH. PASS`
        : `[sim] no DHT22 response on ${dhtGpio} (timeout). FAIL`,
    },
  ];
}
