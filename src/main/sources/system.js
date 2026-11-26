// System: CPU load per core and temperature, memory as Activity Monitor counts it, and free disk space
// as Finder counts it. Parsing and arithmetic are pure and tested in test/system.test.js; temperature
// and volumes come from mac-sensors.js (koffi), imported lazily so the tests run in plain Node.
import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";

const run = promisify(execFile);
const TIMEOUT_MS = 5000;
// The first reading has nothing to compare with, so it takes two samples this far apart.
const FIRST_SAMPLE_GAP_MS = 300;
// Older samples describe another moment: start again instead of averaging a long stretch.
const STALE_SAMPLE_MS = 60 * 1000;
// Finder's "available" space takes a moment to compute and changes slowly.
const VOLUMES_TTL_MS = 60 * 1000;
const PRESSURE = { 1: "normal", 2: "warn", 4: "critical" };
// Die sensors on Apple silicon: "PMU tdie…", or "pACC/eACC MTR Temp Sensor…" on the first M1.
const CPU_SENSORS = [/^PMU tdie\d+$/, /^[pe]ACC MTR Temp Sensor\d+$/];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** os.cpus() → per core { busy, total } tick counters. */
export const cpuTimes = (cpus) =>
  cpus.map(({ times }) => {
    const total = times.user + times.nice + times.sys + times.idle + times.irq;
    return { busy: total - times.idle, total };
  });

/** Two cpuTimes() samples → load of each core and of the whole CPU, 0–100. */
export const cpuLoad = (before, after) => {
  const percent = (busy, total) => (total > 0 ? Math.round((Math.max(0, busy) / total) * 100) : 0);
  const deltas = after.map((core, index) => ({
    busy: core.busy - (before[index]?.busy ?? 0),
    total: core.total - (before[index]?.total ?? 0),
  }));
  const sum = deltas.reduce((all, core) => ({ busy: all.busy + core.busy, total: all.total + core.total }), { busy: 0, total: 0 });
  return { percent: percent(sum.busy, sum.total), cores: deltas.map((core) => percent(core.busy, core.total)) };
};

/**
 * Which cores are efficiency cores. macOS numbers the efficiency cluster first on Apple silicon;
 * Intel Macs have one kind (efficiency = 0).
 * @returns {("efficiency" | "performance")[]}
 */
export const coreKinds = (count, efficiency) =>
  Array.from({ length: count }, (_, index) => (index < efficiency ? "efficiency" : "performance"));

/**
 * `vm_stat` → memory in bytes, counted like Activity Monitor: used = app + wired + compressed.
 * @param {string} output
 * @param {number} total bytes of RAM
 */
export const parseVmStat = (output, total) => {
  const pageSize = Number(/page size of (\d+) bytes/.exec(output)?.[1] ?? 4096);
  const pages = (label) => Number(new RegExp(`^${label}:\\s+(\\d+)`, "m").exec(output)?.[1] ?? 0) * pageSize;
  const app = Math.max(0, pages("Anonymous pages") - pages("Pages purgeable"));
  const wired = pages("Pages wired down");
  const compressed = pages("Pages occupied by compressor");
  const used = Math.min(total, app + wired + compressed);
  return { total, used, app, wired, compressed, cached: pages("File-backed pages") + pages("Pages purgeable") };
};

const bytesOf = (text) => {
  const match = /([\d.]+)([KMG])/.exec(text ?? "");
  if (!match) return 0;
  return Math.round(Number(match[1]) * { K: 1024, M: 1024 ** 2, G: 1024 ** 3 }[match[2]]);
};

/**
 * `sysctl -n vm.swapusage kern.memorystatus_vm_pressure_level` → swap in bytes and pressure.
 * @param {string} output
 */
export const parseSwapAndPressure = (output) => {
  const [swapLine = "", levelLine = ""] = output.trim().split("\n");
  return {
    swapUsed: bytesOf(/used = (\S+)/.exec(swapLine)?.[1]),
    swapTotal: bytesOf(/total = (\S+)/.exec(swapLine)?.[1]),
    pressure: PRESSURE[Number(levelLine.trim())] ?? "normal",
  };
};

/**
 * The CPU's temperature: the average of the first kind of die sensor present. Null when there are
 * none, e.g. on Intel Macs.
 * @param {{ name: string, celsius: number }[]} sensors
 */
export const cpuTemperature = (sensors) => {
  const valid = sensors.filter(({ celsius }) => Number.isFinite(celsius) && celsius > 0 && celsius < 150);
  for (const pattern of CPU_SENSORS) {
    const matches = valid.filter(({ name }) => pattern.test(name));
    if (matches.length) return Math.round((matches.reduce((sum, { celsius }) => sum + celsius, 0) / matches.length) * 10) / 10;
  }
  return null;
};

/** "Apple M1 Pro" → "M1 Pro"; Intel brand strings lose their trademarks and clock speed. */
export const chipName = (brand = "") =>
  brand
    .replace(/^Apple\s+/, "")
    .replace(/\((R|TM)\)/g, "")
    .replace(/\s*CPU\s*@.*$/, "")
    .replace(/\s+/g, " ")
    .trim();

/** Startup disk first, then the others by name. */
export const sortVolumes = (volumes) =>
  [...volumes].sort((a, b) => (a.path === "/" ? -1 : b.path === "/" ? 1 : a.name.localeCompare(b.name)));

let lastSample = null;
let chip = null;
let volumesCache = { at: 0, value: [] };

const readCpu = async () => {
  const fresh = lastSample && Date.now() - lastSample.at < STALE_SAMPLE_MS;
  let before = fresh ? lastSample.times : null;
  if (!before) {
    before = cpuTimes(os.cpus());
    await delay(FIRST_SAMPLE_GAP_MS);
  }
  const after = cpuTimes(os.cpus());
  lastSample = { at: Date.now(), times: after };
  return cpuLoad(before, after);
};

const readChip = async () => {
  if (chip) return chip;
  const { stdout } = await run("/usr/sbin/sysctl", ["-n", "machdep.cpu.brand_string"], { timeout: TIMEOUT_MS });
  // hw.perflevel1 only exists on Macs with two kinds of core.
  const efficiency = await run("/usr/sbin/sysctl", ["-n", "hw.perflevel1.logicalcpu"], { timeout: TIMEOUT_MS })
    .then(({ stdout: count }) => Number(count.trim()) || 0)
    .catch(() => 0);
  chip = { name: chipName(stdout), efficiency };
  return chip;
};

const readMemory = async () => {
  const [vm, swap] = await Promise.all([
    run("/usr/bin/vm_stat", [], { timeout: TIMEOUT_MS }),
    run("/usr/sbin/sysctl", ["-n", "vm.swapusage", "kern.memorystatus_vm_pressure_level"], { timeout: TIMEOUT_MS }),
  ]);
  return { ...parseVmStat(vm.stdout, os.totalmem()), ...parseSwapAndPressure(swap.stdout) };
};

const readVolumes = (native) => {
  if (Date.now() - volumesCache.at < VOLUMES_TTL_MS) return volumesCache.value;
  const value = sortVolumes(native.readVolumes().filter((volume) => !volume.readOnly && volume.total > 0));
  volumesCache = { at: Date.now(), value };
  return value;
};

const readCpuTemperature = async (native) => {
  const either = new RegExp(CPU_SENSORS.map((pattern) => pattern.source).join("|"));
  return cpuTemperature(await native.readTemperatures(either));
};

/** A reading that failed shows as missing (null) instead of breaking the whole widget. */
const orNull = (label, promise) =>
  promise.catch((error) => {
    console.error(`system: couldn't read ${label}:`, error);
    return null;
  });

const thermalState = async () => {
  const electron = await import("electron");
  const powerMonitor = electron.powerMonitor ?? electron.default?.powerMonitor;
  return powerMonitor?.getCurrentThermalState?.() ?? "unknown";
};

export const readSystem = async () => {
  const native = await import("./mac-sensors.js");
  const [cpu, info, celsius, memory, volumes, thermal] = await Promise.all([
    readCpu(),
    readChip(),
    orNull("the temperature", readCpuTemperature(native)),
    orNull("memory", readMemory()),
    orNull("volumes", Promise.resolve().then(() => readVolumes(native))),
    thermalState(),
  ]);
  return {
    chip: info.name,
    cpu: { ...cpu, kinds: coreKinds(cpu.cores.length, info.efficiency), celsius, thermal },
    memory,
    volumes: volumes ?? [],
  };
};
