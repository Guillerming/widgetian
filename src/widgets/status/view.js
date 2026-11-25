// Draws the sections of a view (shared/status-view.js). Used by the card and by the settings
// window's script preview. handlers: open(url), run(action); tabs: a Map that remembers which tab is
// open in each place, so a refresh does not change it.
import { h, icon, replace } from "../../renderer/shared/dom.js";
import { ICONS, toneIcon } from "../../renderer/shared/ui.js";
import { htmlSection } from "./html.js";

const isClickable = (item) => Boolean(item.action || item.url);

const clickProps = (item, handlers) => ({
  title: item.title || item.url || null,
  onClick: () => (item.action ? handlers.run(item.action) : handlers.open(item.url)),
});

const clickIcon = (item) => (item.action ? ICONS.play : ICONS.external);

// ---------- rows ----------
const rowItem = (item, handlers) => {
  const content = [
    h("span", { class: "check-mark" }, item.tone === "none" ? null : toneIcon(item.tone, 11)),
    h("span", { class: "check-label", title: item.label }, item.label),
    h("span", { class: "check-detail", title: item.detail }, item.detail),
    isClickable(item) ? h("span", { class: "check-link" }, icon(clickIcon(item), { size: 11, stroke: 2 })) : null,
  ];
  const body = isClickable(item) ? h("button", { type: "button", ...clickProps(item, handlers) }, content) : content;
  return h("li", { dataset: { tone: item.tone, ...(item.running ? { running: "true" } : {}) } }, body);
};

// ---------- chart ----------
const CHART = { width: 100, height: 40, pad: 3 };
let chartCount = 0;

const pointsOf = (values, peak) =>
  values.map((value, index) => [
    (index / (values.length - 1)) * CHART.width,
    CHART.height - CHART.pad - (value / peak) * (CHART.height - 2 * CHART.pad),
  ]);

const pathOf = (points) => points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");

const seriesPaths = ({ style, values }, peak, fillId) => {
  const points = pointsOf(values, peak);
  const line = h("path", { class: style === "dashed" ? "line-dashed" : "line", d: pathOf(points), "vector-effect": "non-scaling-stroke" });
  if (style !== "area") return [line];
  const [lastX, lastY] = points.at(-1);
  return [
    h("path", { class: "area", d: `${pathOf(points)} L${CHART.width},${CHART.height} L0,${CHART.height} Z`, fill: `url(#${fillId})` }),
    line,
    // A zero-length round-capped stroke stays a circle however the SVG is stretched.
    h("path", { class: "last", d: `M${lastX},${lastY} h0.001`, "vector-effect": "non-scaling-stroke" }),
  ];
};

const chartLine = (series) => {
  const peak = Math.max(1, ...series.flatMap((entry) => entry.values));
  chartCount += 1;
  const fillId = `status-fill-${chartCount}`;
  const gradient = h(
    "linearGradient",
    { id: fillId, x1: 0, y1: 0, x2: 0, y2: 1 },
    h("stop", { offset: 0, "stop-color": "currentColor", "stop-opacity": 0.32 }),
    h("stop", { offset: 1, "stop-color": "currentColor", "stop-opacity": 0 }),
  );
  // Dashed series first, so the main line is drawn on top of them.
  const ordered = [...series].sort((a, b) => Number(b.style === "dashed") - Number(a.style === "dashed"));
  return h(
    "svg",
    { class: "chart-line", viewBox: `0 0 ${CHART.width} ${CHART.height}`, preserveAspectRatio: "none", "aria-hidden": "true" },
    h("defs", {}, gradient),
    ordered.flatMap((entry) => seriesPaths(entry, peak, fillId)),
  );
};

const chart = (section, handlers) => {
  const meta = [section.detail, section.detail && section.note ? " · " : "", section.note ? h("b", { dataset: section.live ? { live: "true" } : {} }, section.note) : null];
  const content = [
    h("div", { class: "chart-head" }, h("span", { class: "chart-label" }, section.label), h("strong", {}, section.value), h("span", { class: "chart-meta" }, meta)),
    chartLine(section.series),
    section.from || section.to ? h("div", { class: "chart-axis" }, h("span", {}, section.from), h("span", {}, section.to)) : null,
  ];
  return isClickable(section)
    ? h("button", { type: "button", class: "chart", ...clickProps(section, handlers) }, content)
    : h("div", { class: "chart" }, content);
};

// ---------- list ----------
const listItem = (item, handlers) => {
  const content = [
    item.icon ? h("span", { class: "item-icon" }, item.icon) : null,
    item.label ? h("span", { class: "item-label", title: item.label }, item.label) : null,
    h("span", { class: "item-text", title: item.text }, item.text),
    h("span", { class: "item-detail" }, item.detail),
  ];
  const body = isClickable(item) ? h("button", { type: "button", ...clickProps(item, handlers) }, content) : content;
  return h("li", { dataset: item.live ? { live: "true" } : {} }, body);
};

const listSection = (section, handlers) =>
  h(
    "section",
    { class: "item-list", "aria-label": section.title || null },
    section.title ? h("h3", {}, section.title) : null,
    section.items.length === 0 ? h("p", { class: "item-empty" }, section.empty) : h("ul", {}, section.items.map((item) => listItem(item, handlers))),
  );

// ---------- tabs ----------
/**
 * A tab strip. `items` = [{ name, live, content(): Node[] }]; the open one is remembered in `memory` under `key`.
 */
export const tabStrip = (items, memory, key) => {
  const panel = h("div", { class: "tab-panel", role: "tabpanel" });
  const strip = h("div", { class: "tabs", role: "tablist" });
  const show = (name) => {
    const open = items.find((item) => item.name === name) ?? items[0];
    memory.set(key, open.name);
    replace(panel, open.content());
    replace(
      strip,
      items.map((item) =>
        h(
          "button",
          { type: "button", role: "tab", "aria-selected": String(item === open), dataset: item.live ? { live: "true" } : {}, onClick: () => show(item.name) },
          item.name,
        ),
      ),
    );
  };
  show(memory.get(key));
  return h("div", { class: "tabbed" }, items.length > 1 ? strip : null, panel);
};

// ---------- the rest ----------
const stats = (section) =>
  h(
    "dl",
    { class: "stats" },
    section.items.map((item) =>
      h("div", { dataset: { tone: item.tone } }, h("dt", {}, item.label), h("dd", {}, item.value, item.detail ? h("small", {}, item.detail) : null)),
    ),
  );

const progress = (section) =>
  h(
    "div",
    { class: "progress", dataset: { tone: section.tone } },
    h("div", { class: "progress-head" }, h("span", {}, section.label), h("span", { class: "check-detail" }, section.detail)),
    h("div", { class: "progress-track" }, h("span", { style: { width: `${section.value * 100}%` } })),
  );

const buttons = (section, handlers) =>
  h(
    "div",
    { class: "buttons" },
    section.items.map((item) => h("button", { type: "button", disabled: !isClickable(item), ...clickProps(item, handlers) }, item.label)),
  );

const DRAW = {
  text: (section) => h("p", { class: "block-text" }, section.text),
  stats,
  progress,
  rows: (section, handlers) => h("ul", { class: "checks" }, section.items.map((item) => rowItem(item, handlers))),
  chart,
  list: listSection,
  buttons,
  html: htmlSection,
  tabs: (section, handlers, memory, key) =>
    tabStrip(
      section.items.map((item, index) => ({ name: item.name, live: item.live, content: () => drawSections(item.sections, handlers, memory, `${key}/${index}`) })),
      memory,
      key,
    ),
};

/** @returns {HTMLElement[]} one element per section */
export const drawSections = (sections, handlers, memory, key = "") =>
  sections.map((section, index) => DRAW[section.kind](section, handlers, memory, `${key}/${index}`));
