// Widgetian's configuration: defaults and normalisation. Pure functions, no I/O.
//
// config.json is edited by hand, by the settings window and by widgets (e.g. the to-do list), so
// whatever comes in is normalised: unknown widget types are dropped, missing settings get their
// defaults, numbers are clamped. Functions never mutate their input.
import { CATALOG } from "./catalog.js";
import { normalizeStatusSettings } from "./status-config.js";
import { THEMES, DEFAULT_THEME_ID } from "./wallpaper-themes.js";

export const CONFIG_VERSION = 1;
export const MAX_COLUMNS = 8;

const DEFAULT_GENERAL = {
  locale: "",
  timeFormat: "24h",
  openAtLogin: true,
  hideDesktopIcons: false,
  // "primary" | "all" | "one"; displayId and displayLabel say which one.
  display: "primary",
  displayId: 0,
  displayLabel: "",
};
const DEFAULT_LAYOUT = { columns: 5, edge: 24, gap: 12 };
export const WALLPAPER_MODES = ["off", "gradient", "images"];
export const IMAGE_EFFECTS = ["none", "dim", "blur", "drift"];
const DEFAULT_WALLPAPER = {
  mode: "gradient",
  theme: DEFAULT_THEME_ID,
  customColors: ["#fa4b3e", "#ff9a54", "#85c8e8", "#285c9e"],
  // Multiplies each theme's own animation speed: 0 = still, 1 = as designed, 2 = twice as fast.
  speed: 1,
  imagesFolder: "",
  imageMinutes: 30,
  imageEffect: "none",
  pauseOnBattery: false,
};

/** The widgets a new user sees. Column/order give the starting layout. */
const STARTER_WIDGETS = [
  ["clock", 1, 1, true],
  ["weather", 1, 2, true],
  ["power", 1, 3, true],
  ["music", 1, 4, false],
  ["wallpaper-picker", 1, 5, true],
  ["calendar", 2, 1, true],
  ["todo", 2, 2, true],
  ["ai", 2, 3, false],
  ["status", 3, 1, true],
  ["finder", 3, 2, true],
];

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};
const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const text = (value, fallback = "") => (typeof value === "string" ? value : fallback);

const randomId = () => Math.random().toString(36).slice(2, 8);

/** A widget instance with its type's default settings. */
export const createWidget = (type, column = 1, order = 1, id = `${type}-${randomId()}`) => ({
  id,
  type,
  enabled: true,
  column,
  order,
  settings: structuredClone(CATALOG[type].defaults),
});

export const defaultConfig = () => ({
  version: CONFIG_VERSION,
  general: { ...DEFAULT_GENERAL },
  layout: { ...DEFAULT_LAYOUT },
  wallpaper: structuredClone(DEFAULT_WALLPAPER),
  widgets: STARTER_WIDGETS.map(([type, column, order, enabled]) => ({
    ...createWidget(type, column, order, type),
    enabled,
  })),
});

/** Settings merged over the type's defaults; nested plain objects (e.g. location) merge one level. */
const normalizeSettings = (type, settings) => {
  const defaults = CATALOG[type].defaults;
  if (type === "status") return normalizeStatusSettings(settings, defaults);
  const given = isObject(settings) ? settings : {};
  const merged = { ...structuredClone(defaults), ...given };
  for (const [key, value] of Object.entries(defaults)) {
    if (isObject(value)) merged[key] = { ...value, ...(isObject(given[key]) ? given[key] : {}) };
    if (Array.isArray(value) && !Array.isArray(merged[key])) merged[key] = structuredClone(value);
  }
  return merged;
};

const normalizeWidgets = (widgets, columns) => {
  if (!Array.isArray(widgets)) return defaultConfig().widgets;
  const seen = new Set();
  return widgets
    .filter((widget) => isObject(widget) && Object.hasOwn(CATALOG, widget.type))
    .map((widget, index) => {
      let id = text(widget.id) || `${widget.type}-${index + 1}`;
      while (seen.has(id)) id = `${id}-${index + 1}`;
      seen.add(id);
      return {
        id,
        type: widget.type,
        enabled: widget.enabled !== false,
        column: clamp(widget.column, 1, columns, 1),
        order: Number.isFinite(Number(widget.order)) ? Number(widget.order) : index + 1,
        settings: normalizeSettings(widget.type, widget.settings),
      };
    });
};

const normalizeWallpaper = (raw) => {
  const given = isObject(raw) ? raw : {};
  const colors =
    Array.isArray(given.customColors) &&
    given.customColors.length === 4 &&
    given.customColors.every((color) => /^#[0-9a-f]{6}$/i.test(color))
      ? [...given.customColors]
      : [...DEFAULT_WALLPAPER.customColors];
  const speed = Number(given.speed);
  return {
    mode: oneOf(given.mode, WALLPAPER_MODES, DEFAULT_WALLPAPER.mode),
    theme: oneOf(given.theme, [...THEMES.map((theme) => theme.id), "custom"], DEFAULT_WALLPAPER.theme),
    customColors: colors,
    speed: Number.isFinite(speed) ? Math.min(2, Math.max(0, speed)) : DEFAULT_WALLPAPER.speed,
    imagesFolder: text(given.imagesFolder),
    imageMinutes: clamp(given.imageMinutes, 1, 24 * 60, DEFAULT_WALLPAPER.imageMinutes),
    imageEffect: oneOf(given.imageEffect, IMAGE_EFFECTS, DEFAULT_WALLPAPER.imageEffect),
    pauseOnBattery: given.pauseOnBattery === true,
  };
};

/**
 * Any parsed JSON → a complete, valid config. Never throws.
 * @param {unknown} raw
 */
export const normalizeConfig = (raw) => {
  const given = isObject(raw) ? raw : {};
  const general = isObject(given.general) ? given.general : {};
  const layout = isObject(given.layout) ? given.layout : {};
  const columns = clamp(layout.columns, 1, MAX_COLUMNS, DEFAULT_LAYOUT.columns);
  return {
    version: CONFIG_VERSION,
    general: {
      locale: text(general.locale),
      timeFormat: oneOf(general.timeFormat, ["24h", "12h"], DEFAULT_GENERAL.timeFormat),
      openAtLogin: general.openAtLogin !== false,
      hideDesktopIcons: general.hideDesktopIcons === true,
      display: oneOf(general.display, ["primary", "all", "one"], DEFAULT_GENERAL.display),
      displayId: Number.isFinite(general.displayId) ? general.displayId : DEFAULT_GENERAL.displayId,
      displayLabel: text(general.displayLabel),
    },
    layout: {
      columns,
      edge: clamp(layout.edge, 0, 200, DEFAULT_LAYOUT.edge),
      gap: clamp(layout.gap, 0, 100, DEFAULT_LAYOUT.gap),
    },
    wallpaper: normalizeWallpaper(given.wallpaper),
    widgets: Object.hasOwn(given, "widgets") ? normalizeWidgets(given.widgets, columns) : defaultConfig().widgets,
  };
};

/** Enabled widgets grouped by column (index 0 = column 1), each column sorted by order. */
export const columnsOf = (config) => {
  const columns = Array.from({ length: config.layout.columns }, () => []);
  for (const widget of config.widgets) {
    if (widget.enabled) columns[widget.column - 1].push(widget);
  }
  return columns.map((column) => column.sort((a, b) => a.order - b.order));
};

/**
 * A copy of the config with one widget moved to `column` at position `index` (0-based, among the
 * other widgets of that column, disabled ones included). Orders are renumbered 1…n in the columns
 * it left and entered.
 */
export const moveWidget = (config, widgetId, column, index) => {
  const moving = config.widgets.find((widget) => widget.id === widgetId);
  if (!moving) return config;
  const othersIn = (number) =>
    config.widgets.filter((widget) => widget.column === number && widget.id !== widgetId).sort((a, b) => a.order - b.order);
  const target = othersIn(column);
  target.splice(Math.max(0, Math.min(index, target.length)), 0, moving);
  const placement = new Map(target.map((widget, position) => [widget.id, { column, order: position + 1 }]));
  if (moving.column !== column) {
    othersIn(moving.column).forEach((widget, position) => placement.set(widget.id, { column: moving.column, order: position + 1 }));
  }
  return {
    ...config,
    widgets: config.widgets.map((widget) => (placement.has(widget.id) ? { ...widget, ...placement.get(widget.id) } : widget)),
  };
};

/** The column a widget added with a click goes to: the one with the fewest widgets. */
export const emptiestColumn = (config) => {
  const counts = Array.from({ length: config.layout.columns }, (_, index) => config.widgets.filter((widget) => widget.column === index + 1).length);
  return counts.indexOf(Math.min(...counts)) + 1;
};

/** A copy of the config with a new widget (from createWidget) at `index` of `column`. */
export const insertWidget = (config, widget, column, index = Number.MAX_SAFE_INTEGER) =>
  moveWidget({ ...config, widgets: [...config.widgets, { ...widget, column, order: Number.MAX_SAFE_INTEGER }] }, widget.id, column, index);

/** A copy of the config with one widget's settings replaced by `update(settings)`. */
export const updateWidgetSettings = (config, widgetId, update) => ({
  ...config,
  widgets: config.widgets.map((widget) =>
    widget.id === widgetId ? { ...widget, settings: update(widget.settings) } : widget,
  ),
});

/** Whether a widget whose timeFormat may be "inherit" shows a 12-hour clock. */
export const uses12h = (general, timeFormat = "inherit") =>
  (timeFormat === "inherit" ? general.timeFormat : timeFormat) === "12h";
