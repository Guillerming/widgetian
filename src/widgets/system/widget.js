// System: three rings (CPU, memory, startup disk) and a bar per core, efficiency cores apart from
// performance cores. Built once and updated in place, so rings and bars glide between readings.
import { h, replace } from "../../renderer/shared/dom.js";
import { card, notice, ring } from "../../renderer/shared/ui.js";

const SECOND_MS = 1000;
const MIN_EVERY = 2;
const MAX_EVERY = 60;
const BUSY_CPU = 85;
const LOW_DISK = 10;
const HOT_STATES = new Set(["serious", "critical"]);
const GROUP_LABELS = { efficiency: "Efficiency", performance: "Performance" };

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || min));

/** Memory in binary units like Activity Monitor; disks in decimal units like Finder. */
const formatBytes = (bytes, base) => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  const power = bytes > 0 ? Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(base))) : 0;
  const value = bytes / base ** power;
  const rounded = value >= 100 || power < 3 ? Math.round(value) : Number(value.toFixed(1));
  return `${rounded} ${units[power]}`;
};
const memory = (bytes) => formatBytes(bytes, 1024);
const disk = (bytes) => formatBytes(bytes, 1000);

const temperature = (celsius, units) =>
  units === "fahrenheit" ? `${Math.round((celsius * 9) / 5 + 32)} °F` : `${Math.round(celsius)} °C`;

const usedPercent = (used, total) => (total > 0 ? Math.round((used / total) * 100) : null);

/** A ring gauge with its name and a detail line, updated in place by set(). */
const gauge = (name) => {
  const value = h("span", { class: "gauge-value" }, "–");
  const meter = ring({ percent: 0, className: "system-ring", children: value });
  const detail = h("small");
  const element = h("li", { class: "gauge" }, meter, h("strong", {}, name), detail);
  return {
    element,
    set: ({ percent, tone = "normal", text, title = "" }) => {
      meter.dataset.tone = percent === null ? "unknown" : tone;
      meter.querySelector(".ring-arc")?.setAttribute("stroke-dashoffset", String(100 - (percent ?? 0)));
      value.textContent = percent === null ? "–" : `${percent}%`;
      detail.textContent = text;
      element.title = title;
    },
  };
};

const memoryTitle = (mem) =>
  [
    `App memory ${memory(mem.app)}`,
    `Wired ${memory(mem.wired)}`,
    `Compressed ${memory(mem.compressed)}`,
    `Cached files ${memory(mem.cached)}`,
    `Swap ${memory(mem.swapUsed)}`,
  ].join("\n");

/** Bars for each core, grouped by kind; set() takes the load of every core. */
const coreStrip = (kinds) => {
  const groups = Object.keys(GROUP_LABELS).filter((kind) => kinds.includes(kind));
  const fills = kinds.map(() => h("span", { class: "core-fill" }));
  const element = h(
    "div",
    { class: "cores", "aria-hidden": "true" },
    groups.map((kind) =>
      h(
        "div",
        { class: "core-group", dataset: { kind }, style: { "--cores": kinds.filter((each) => each === kind).length } },
        h(
          "div",
          { class: "core-bars" },
          kinds.flatMap((coreKind, index) => (coreKind === kind ? [h("span", { class: "core" }, fills[index])] : [])),
        ),
        h("small", {}, groups.length > 1 ? GROUP_LABELS[kind] : `${kinds.length} cores`),
      ),
    ),
  );
  return {
    element,
    set: (loads) =>
      loads.forEach((load, index) => {
        fills[index]?.style.setProperty("--load", String(load / 100));
        fills[index]?.toggleAttribute("data-busy", load >= BUSY_CPU);
      }),
  };
};

const volumeRow = (volume) =>
  h(
    "li",
    { class: "volume", title: `${disk(volume.free)} free of ${disk(volume.total)}` },
    h("span", { class: "volume-name" }, volume.name),
    h("span", { class: "volume-free" }, `${disk(volume.free)} free`),
    h("span", { class: "volume-bar" }, h("span", { style: { "--used": String(1 - volume.free / volume.total) } })),
  );

export function mount(root, ctx) {
  const { settings } = ctx;
  const shell = card({ eyebrow: "System", className: "system" });
  root.append(shell.element);
  replace(shell.body, notice("One moment…"));

  const gauges = { cpu: gauge("CPU"), memory: gauge("Memory"), disk: gauge("Disk") };
  const others = h("ul", { class: "volumes" });
  let cores = null;
  let built = false;

  const build = (system) => {
    cores = settings.showCores && system.cpu.cores.length ? coreStrip(system.cpu.kinds) : null;
    replace(
      shell.body,
      h("ul", { class: "gauges" }, Object.values(gauges).map(({ element }) => element)),
      cores?.element,
      others,
    );
    built = true;
  };

  const render = (system) => {
    if (!built) build(system);
    shell.setAside(system.chip);

    const { cpu } = system;
    const showTemperature = settings.showTemperature && cpu.celsius !== null;
    const hot = HOT_STATES.has(cpu.thermal);
    gauges.cpu.set({
      percent: cpu.percent,
      tone: cpu.percent >= BUSY_CPU || hot ? "wait" : "normal",
      text: showTemperature ? temperature(cpu.celsius, settings.units) : `${cpu.cores.length} cores`,
      title: hot ? "macOS is slowing the CPU down to cool it" : "",
    });
    cores?.set(cpu.cores);

    const mem = system.memory;
    gauges.memory.set(
      mem
        ? {
            percent: usedPercent(mem.used, mem.total),
            tone: mem.pressure === "normal" ? "normal" : "wait",
            text: `${memory(mem.used)} of ${memory(mem.total)}`,
            title: memoryTitle(mem),
          }
        : { percent: null, text: "Unavailable" },
    );

    const [startup, ...rest] = system.volumes;
    gauges.disk.set(
      startup
        ? {
            percent: usedPercent(startup.total - startup.free, startup.total),
            tone: startup.free / startup.total < LOW_DISK / 100 ? "wait" : "normal",
            text: `${disk(startup.free)} free`,
            title: `${startup.name}: ${disk(startup.free)} free of ${disk(startup.total)}`,
          }
        : { percent: null, text: "Unavailable" },
    );
    replace(others, settings.disks === "all" ? rest.map(volumeRow) : []);
  };

  ctx.every(clamp(settings.every, MIN_EVERY, MAX_EVERY) * SECOND_MS, () =>
    ctx.api
      .source("system")
      .then(render)
      .catch(() => {
        built = false;
        replace(shell.body, notice("Couldn't read the system status."));
      }),
  );
}
