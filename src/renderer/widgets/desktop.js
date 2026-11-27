// The widgets window: lays out the widgets in columns and keeps them in sync with
// config.json. A widget is remounted only when its own settings (or the general settings) change,
// so ticking a to-do item does not restart the music player.
import { columnsOf, uses12h } from "../../shared/config.js";
import { h, replace } from "../shared/dom.js";
import { card, notice, openLink } from "../shared/ui.js";

const api = window.widgetian;
const params = new URLSearchParams(location.search);
const columnsElement = document.getElementById("columns");
const byline = document.getElementById("byline");

/** widget id → { type, key, element, cleanups } */
const mounted = new Map();
const loadedStyles = new Set();

if (params.has("preview")) document.body.classList.add("preview");

const loadStyle = (type) => {
  if (loadedStyles.has(type)) return;
  loadedStyles.add(type);
  document.head.append(h("link", { rel: "stylesheet", href: `../../widgets/${type}/widget.css` }));
};

const failureCard = (widget, error) => {
  const { element, body } = card({ eyebrow: widget.type, className: "widget-error" });
  body.append(notice("This widget could not start."), h("small", {}, String(error?.message ?? error)));
  return element;
};

/** The context every widget's mount() receives. */
const contextFor = (widget, config, cleanups) => ({
  id: widget.id,
  settings: widget.settings,
  general: config.general,
  locale: config.general.locale || undefined,
  hour12: (timeFormat) => uses12h(config.general, timeFormat),
  api,
  save: (settings) => api.widgets.saveSettings(widget.id, settings),
  onCleanup: (cleanup) => cleanups.push(cleanup),
  /** Runs `task` now and every `ms`, until the widget unmounts. */
  every: (ms, task) => {
    task();
    const timer = setInterval(task, ms);
    cleanups.push(() => clearInterval(timer));
  },
  openSettings: () => api.openSettings(`widget:${widget.id}`),
});

const unmount = (id) => {
  const entry = mounted.get(id);
  if (!entry) return;
  for (const cleanup of entry.cleanups.splice(0)) {
    try {
      cleanup();
    } catch (error) {
      console.error(`Cleanup of ${id} failed`, error);
    }
  }
  resizes.unobserve(entry.element);
  entry.element.remove();
  mounted.delete(id);
};

const mount = (widget, config, key) => {
  const element = h("div", { class: "widget", dataset: { type: widget.type, id: widget.id } });
  const cleanups = [];
  resizes.observe(element);
  mounted.set(widget.id, { type: widget.type, key, general: JSON.stringify(config.general), element, cleanups, update: null });
  loadStyle(widget.type);
  import(`../../widgets/${widget.type}/widget.js`)
    .then((module) => {
      const entry = mounted.get(widget.id);
      if (entry?.element !== element) return; // replaced while loading
      // mount() may return a cleanup function, or { destroy, update } to take new settings in place.
      const result = module.mount(element, contextFor(widget, config, cleanups));
      if (typeof result === "function") cleanups.push(result);
      if (typeof result?.destroy === "function") cleanups.push(result.destroy);
      if (typeof result?.update === "function") entry.update = result.update;
    })
    .catch((error) => {
      console.error(`Widget ${widget.id} failed`, error);
      replace(element, failureCard(widget, error));
    });
  return element;
};

const applyLayout = ({ layout }) => {
  const style = document.documentElement.style;
  style.setProperty("--columns", layout.columns);
  style.setProperty("--edge", `${layout.edge}px`);
  style.setProperty("--gap", `${layout.gap}px`);
  while (columnsElement.children.length < layout.columns) columnsElement.append(h("div", { class: "column" }));
  while (columnsElement.children.length > layout.columns) columnsElement.lastElementChild.remove();
};

const apply = (config) => {
  applyLayout(config);
  const wanted = new Set();
  columnsOf(config).forEach((widgets, index) => {
    const column = columnsElement.children[index];
    for (const widget of widgets) {
      wanted.add(widget.id);
      const key = JSON.stringify([widget.type, widget.settings, config.general]);
      const existing = mounted.get(widget.id);
      const sameFrame = existing && existing.type === widget.type && existing.general === JSON.stringify(config.general);
      if (existing && existing.key !== key && sameFrame && existing.update) {
        existing.update(widget.settings);
        existing.key = key;
      } else if (existing && existing.key !== key) {
        unmount(widget.id);
      }
      const element = mounted.get(widget.id)?.element ?? mount(widget, config, key);
      column.append(element); // moves it into place if its column or order changed
    }
  });
  for (const id of [...mounted.keys()]) if (!wanted.has(id)) unmount(id);
  scheduleReport();
};

/** Tells the main process where the clickable things are (see main/pointer.js). */
let reported = "";
const reportRects = () => {
  const rects = [...document.querySelectorAll(".widget, .byline")].map((element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  });
  const text = JSON.stringify(rects);
  if (text === reported) return;
  reported = text;
  api.setHotRects(rects);
};

const REPORT_DELAY_MS = 50;
let reportTimer = null;
const scheduleReport = () => {
  clearTimeout(reportTimer);
  reportTimer = setTimeout(reportRects, REPORT_DELAY_MS);
};

// A widget that changes size moves the ones below it, so any change reports them all.
const resizes = new ResizeObserver(scheduleReport);

const watchRects = () => {
  resizes.observe(byline);
  window.addEventListener("resize", scheduleReport);
  document.addEventListener("animationend", scheduleReport);
};

const start = async () => {
  watchRects();
  const [config, info] = await Promise.all([api.config.get(), api.appInfo()]);
  byline.addEventListener("click", (event) => {
    event.preventDefault();
    openLink(info.productPage);
  });
  apply(config);
  api.config.onChange(apply);
};

start().catch((error) => {
  console.error(error);
  const failed = h("div", { class: "widget" }, failureCard({ type: "Widgetian" }, error));
  replace(columnsElement, h("div", { class: "column" }, failed));
});
