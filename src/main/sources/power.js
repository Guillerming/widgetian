// Power status: this Mac's battery (pmset) and connected Bluetooth devices (system_profiler + pmset).
// Read-only system commands; parsing is pure and tested in test/power.test.js.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const TIMEOUT_MS = 15000;

const KINDS = [
  ["mouse", "mouse"],
  ["keyboard", "keyboard"],
  ["trackpad", "trackpad"],
  ["headphones", "headphones"],
  ["headset", "headphones"],
  ["speaker", "speaker"],
  ["gamepad", "gamepad"],
];
const LEVEL_KEYS = ["device_batteryLevelMain", "device_batteryLevelLeft", "device_batteryLevelRight"];
// " -InternalBattery-0 (id=1234567)	100%; charged; 0:00 remaining present: true"
const SOURCE_LINE = /^\s*-(.+?) \(id=\d+\)\s+(\d+)%;\s*([^;]*)(?:;\s*(\d+:\d+|\(no estimate\)))?/;

/**
 * `pmset -g batt` → the Mac's battery, or null on a Mac without one.
 * @param {string} output
 */
export const parseBattery = (output) => {
  const plugged = /'AC Power'/.test(output);
  for (const line of output.split("\n")) {
    const match = SOURCE_LINE.exec(line);
    if (!match || !match[1].startsWith("InternalBattery")) continue;
    const state = match[3].trim();
    const [hours, minutes] = /^\d+:\d+$/.test(match[4] ?? "") ? match[4].split(":").map(Number) : [];
    const minutesLeft = hours === undefined ? null : hours * 60 + minutes;
    return {
      percent: Number(match[2]),
      charging: state === "charging" || state === "finishing charge",
      plugged,
      charged: state === "charged",
      minutesLeft: minutesLeft === 0 ? null : minutesLeft,
    };
  }
  return null;
};

/**
 * `pmset -g accps` → battery of every accessory by name (third-party BLE mice, keyboards…).
 * @param {string} output
 */
export const parseAccessories = (output) => {
  const levels = {};
  for (const line of output.split("\n")) {
    const match = SOURCE_LINE.exec(line);
    if (match && !match[1].startsWith("InternalBattery")) levels[match[1]] = Number(match[2]);
  }
  return levels;
};

const percentOf = (text) => {
  const match = /\d+/.exec(text ?? "");
  return match ? Number(match[0]) : null;
};

const kindOf = (minorType = "") => {
  const lowered = minorType.toLowerCase();
  return KINDS.find(([key]) => lowered.includes(key))?.[1] ?? "device";
};

/**
 * `system_profiler -json SPBluetoothDataType` + accessory levels → connected devices.
 * AirPods report each bud: the lowest is what runs out first.
 */
export const parseBluetooth = (json, accessories) => {
  const controllers = json?.SPBluetoothDataType ?? [];
  const connected = controllers[0]?.device_connected ?? [];
  return connected.flatMap((entry) =>
    Object.entries(entry).map(([name, info]) => {
      let levels = LEVEL_KEYS.map((key) => percentOf(info[key])).filter((level) => level !== null);
      if (levels.length === 0 && name in accessories) levels = [accessories[name]];
      return { name, kind: kindOf(info.device_minorType), percent: levels.length ? Math.min(...levels) : null };
    }),
  );
};

export const readPower = async () => {
  const [battery, accessories, bluetooth] = await Promise.all([
    run("/usr/bin/pmset", ["-g", "batt"], { timeout: TIMEOUT_MS }),
    run("/usr/bin/pmset", ["-g", "accps"], { timeout: TIMEOUT_MS }),
    run("/usr/sbin/system_profiler", ["-json", "SPBluetoothDataType"], { timeout: TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }),
  ]);
  return {
    mac: parseBattery(battery.stdout),
    devices: parseBluetooth(JSON.parse(bluetooth.stdout), parseAccessories(accessories.stdout)),
  };
};
