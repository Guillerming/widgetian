// Widgetian's configuration: defaults and normalisation. Pure functions, no I/O.
//
// config.json is edited by hand, by the settings window and by widgets (e.g. the to-do list), so
// whatever comes in is normalised: unknown widget types are dropped, missing settings get their
// defaults, numbers are clamped. Functions never mutate their input.
import { CATALOG } from "./catalog.js";
import { normalizeStatusSettings } from "./status-config.js";
import { DEFAULT_THEME_ID, MAX_CUSTOM_THEMES, THEMES, isCustomThemeId } from "./wallpaper-themes.js";

export const CONFIG_VERSION = 1;
export const MAX_COLUMNS = 8;

const DEFAULT_GENERAL = {
  locale: "",
  timeFormat: "24h",
  openAtLogin: true,
  hideDesktopIcons: false,
  checkForUpdates: true,
  // "primary" | "all" | "one"; displayId and displayLabel say which one.
  display: "primary",
  displayId: 0,
  displayLabel: "",
};
const DEFAULT_LAYOUT = { columns: 5, edge: 24, gap: 12 };
// "system": no wallpaper of Widgetian's, so macOS shows its own (called "off" before 0.2.2).
export const WALLPAPER_MODES = ["system", "gradient", "images"];
export const IMAGE_EFFECTS = ["none", "dim", "blur", "drift"];
const DEFAULT_WALLPAPER = {
  mode: "gradient",
  theme: DEFAULT_THEME_ID,
  // The user's own gradients: { id: "custom-…", name, colors: four "#rrggbb" }.
  customThemes: [],
  // Gradients the user hid: still in Settings, no longer offered by the wallpaper picker.
  hiddenThemes: [],
  // Multiplies each theme's own animation speed: 0 = still, 1 = as designed, 2 = twice as fast.
  speed: 1,
  imagesFolder: "",
  imageMinutes: 30,
  imageEffect: "none",
  // With the blur effect: the blur slowly deepens and eases.
  imageBreathing: true,
  pauseOnBattery: false,
};

/** The widgets a new user sees. Column/order give the starting layout. */
const STARTER_WIDGETS = [
  ["clock", 1, 1],
  ["weather", 1, 2],
  ["power", 1, 3],
  ["wallpaper-picker", 1, 4],
  ["calendar", 2, 1],
  ["todo", 2, 2],
  ["status", 3, 1],
  ["finder", 3, 2],
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
  column,
  order,
  settings: structuredClone(CATALOG[type].defaults),
});

export const defaultConfig = () => ({
  version: CONFIG_VERSION,
  general: { ...DEFAULT_GENERAL },
  layout: { ...DEFAULT_LAYOUT },
  wallpaper: structuredClone(DEFAULT_WALLPAPER),
  widgets: STARTER_WIDGETS.map(([type, column, order]) => createWidget(type, column, order, type)),
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
    // Before 0.2.2 a widget could stay in the layout hidden (enabled: false); now it is deleted instead.
    .filter((widget) => isObject(widget) && Object.hasOwn(CATALOG, widget.type) && widget.enabled !== false)
    .map((widget, index) => {
      let id = text(widget.id) || `${widget.type}-${index + 1}`;
      while (seen.has(id)) id = `${id}-${index + 1}`;
      seen.add(id);
      return {
        id,
        type: widget.type,
        column: clamp(widget.column, 1, columns, 1),
        order: Number.isFinite(Number(widget.order)) ? Number(widget.order) : index + 1,
        settings: normalizeSettings(widget.type, widget.settings),
      };
    });
};

const isColors = (colors) => Array.isArray(colors) && colors.length === 4 && colors.every((color) => /^#[0-9a-f]{6}$/i.test(color));

/** The user's gradients. Before 0.2.2 there was one, as `customColors`: it becomes "Custom". */
const normalizeCustomThemes = (given) => {
  const list = Array.isArray(given.customThemes)
    ? given.customThemes
    : isColors(given.customColors) ? [{ id: "custom", name: "Custom", colors: given.customColors }] : [];
  const seen = new Set();
  return list
    .filter((theme) => isObject(theme) && isCustomThemeId(theme.id) && isColors(theme.colors) && !seen.has(theme.id) && seen.add(theme.id))
    .slice(0, MAX_CUSTOM_THEMES)
    .map((theme) => ({ id: theme.id, name: text(theme.name).trim().slice(0, 40) || "Custom", colors: theme.colors.map((color) => color.toLowerCase()) }));
};

const normalizeWallpaper = (raw) => {
  const given = isObject(raw) ? raw : {};
  const customThemes = normalizeCustomThemes(given);
  const ids = [...THEMES.map((theme) => theme.id), ...customThemes.map((theme) => theme.id)];
  const speed = Number(given.speed);
  return {
    mode: oneOf(given.mode === "off" ? "system" : given.mode, WALLPAPER_MODES, DEFAULT_WALLPAPER.mode),
    theme: oneOf(given.theme, ids, DEFAULT_WALLPAPER.theme),
    customThemes,
    hiddenThemes: Array.isArray(given.hiddenThemes) ? [...new Set(given.hiddenThemes.filter((id) => ids.includes(id)))] : [],
    speed: Number.isFinite(speed) ? Math.min(2, Math.max(0, speed)) : DEFAULT_WALLPAPER.speed,
    imagesFolder: text(given.imagesFolder),
    imageMinutes: clamp(given.imageMinutes, 1, 24 * 60, DEFAULT_WALLPAPER.imageMinutes),
    imageEffect: oneOf(given.imageEffect, IMAGE_EFFECTS, DEFAULT_WALLPAPER.imageEffect),
    imageBreathing: given.imageBreathing !== false,
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
      checkForUpdates: general.checkForUpdates !== false,
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

/** Widgets grouped by column (index 0 = column 1), each column sorted by order. */
export const columnsOf = (config) => {
  const columns = Array.from({ length: config.layout.columns }, () => []);
  for (const widget of config.widgets) {
    columns[widget.column - 1].push(widget);
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
