// Power: battery rings for this Mac and connected Bluetooth devices. Amber when low; a critical
// level shows as a white disc with a red icon (wallpapers are often red, a red arc would vanish).
import { h, icon, replace } from "../../renderer/shared/dom.js";
import { card, hoursAndMinutes, notice, ring } from "../../renderer/shared/ui.js";

const REFRESH_MS = 60 * 1000;
const CRITICAL_AT = 10;

const ICON_PATHS = {
  laptop: "M5 6.5h14v9H5zM3 18.5h18",
  mouse: "M12 3.5a5.5 5.5 0 0 1 5.5 5.5v6a5.5 5.5 0 0 1-11 0V9A5.5 5.5 0 0 1 12 3.5Zm0 0V9",
  keyboard: "M3.5 7h17v10h-17zM7 10.5h1M10.5 10.5h1M14 10.5h1M17 10.5h0M8 14h8",
  trackpad: "M4.5 5.5h15v13h-15zM4.5 15h15M12 15v3.5",
  headphones: "M4.5 15v-3a7.5 7.5 0 0 1 15 0v3M4.5 14h3v5.5h-3zM16.5 14h3v5.5h-3z",
  speaker: "M7 3.5h10v17H7zM12 15.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM12 7h0",
  gamepad: "M7 8h10a4 4 0 0 1 4 4v1.5a3 3 0 0 1-5.4 1.8L14.5 14h-5l-1.1 1.3A3 3 0 0 1 3 13.5V12a4 4 0 0 1 4-4ZM7.5 10.5v3M6 12h3M15.5 11h0M17.5 13h0",
  device: "m7 7.5 10 9-5 4v-17l5 4-10 9",
  bolt: "M13 3 5.5 13.5H12L11 21l7.5-10.5H12L13 3Z",
};

const toneFor = (percent, charging, lowAt) => {
  if (charging) return "good";
  if (percent === null) return "unknown";
  if (percent <= CRITICAL_AT) return "bad";
  return percent <= lowAt ? "wait" : "normal";
};

const macStatus = (mac) => {
  if (mac.charging) return mac.minutesLeft === null ? "Charging" : `Charging · ${hoursAndMinutes(mac.minutesLeft)} to full`;
  if (mac.charged) return "Charged";
  if (mac.plugged) return "On power";
  return mac.minutesLeft === null ? "On battery" : `${hoursAndMinutes(mac.minutesLeft)} left`;
};

const gauge = ({ name, kind, percent, charging }, lowAt) => {
  const tone = toneFor(percent, charging, lowAt);
  return h(
    "li",
    { class: "gauge", dataset: { tone } },
    ring({
      percent,
      tone: tone === "bad" ? "normal" : tone,
      className: "power-ring",
      children: [
        h("span", { class: "gauge-icon" }, icon(ICON_PATHS[kind] ?? ICON_PATHS.device, { size: 20, stroke: 1.7 })),
        charging ? h("span", { class: "gauge-badge" }, icon(ICON_PATHS.bolt, { size: 10, stroke: 1.7 })) : null,
      ],
    }),
    h("strong", { title: name }, name),
    h("small", {}, percent === null ? "Connected" : `${percent}%`),
  );
};

const gaugesOf = (power, settings) =>
  [
    ...(settings.showMac && power.mac
      ? [{ name: "This Mac", kind: "laptop", percent: power.mac.percent, charging: power.mac.charging }]
      : []),
    ...(settings.showDevices ? power.devices.map((device) => ({ ...device, charging: false })) : []),
  ].slice(0, settings.maxGauges);

export function mount(root, ctx) {
  const { settings } = ctx;
  const shell = card({ eyebrow: "Power", className: "power" });
  root.append(shell.element);
  replace(shell.body, notice("One moment…"));

  const render = (power) => {
    const gauges = gaugesOf(power, settings);
    shell.setAside(settings.showMac && power.mac ? macStatus(power.mac) : "");
    if (gauges.length === 0) return replace(shell.body, notice("No battery or Bluetooth devices."));
    const list = h(
      "ul",
      { class: "gauges", style: { "--gauges": Math.max(4, gauges.length) } },
      gauges.map((entry) => gauge(entry, settings.lowAt)),
    );
    return replace(shell.body, list);
  };

  ctx.every(REFRESH_MS, () =>
    ctx.api
      .source("power")
      .then(render)
      .catch(() => replace(shell.body, notice("Couldn't read the power status."))),
  );
}
