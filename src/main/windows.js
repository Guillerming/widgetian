// The windows Widgetian keeps on the desktop, one set per display:
//   wallpaper → full-screen, never clickable, under the Finder's icons or (to hide them) over them;
//   widgets   → from the menu bar to the bottom, above the icons, click-through except over a widget.
// syncDesktop() creates, moves and closes them to match the displays and the config.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, screen } from "electron";
import { levelFor } from "./desktop-icons-plan.js";
import { widgetDisplays, widgetsBounds } from "./displays.js";
import { cleanRects } from "./hit-test.js";
import { pinToDesktop } from "./native.js";
import { trackPointer } from "./pointer.js";
import { APP_URL } from "./protocols.js";

const PRELOAD = path.join(path.dirname(fileURLToPath(import.meta.url)), "../preload/preload.cjs");

export const webPreferences = (extra = {}) => ({
  preload: PRELOAD,
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  spellcheck: false,
  ...extra,
});

/** key `${kind}:${displayId}` → BrowserWindow */
const desktopWindows = new Map();
let settingsWindow = null;

const desktopWindowOptions = (bounds) => ({
  ...bounds,
  frame: false,
  transparent: true,
  backgroundColor: "#00000000",
  hasShadow: false,
  resizable: false,
  movable: false,
  minimizable: false,
  maximizable: false,
  fullscreenable: false,
  skipTaskbar: true,
  roundedCorners: false,
  enableLargerThanScreen: true,
  show: false,
});

const boundsFor = (kind, display) => (kind === "wallpaper" ? display.bounds : widgetsBounds(display));

const setLevel = (window, level) => {
  if (window.level === level) return;
  window.level = level;
  // Before ready-to-show it only has to be remembered.
  if (window.isVisible()) pinToDesktop(window, level);
};

const createDesktopWindow = (kind, display, level) => {
  const bounds = boundsFor(kind, display);
  const window = new BrowserWindow({
    ...desktopWindowOptions(bounds),
    focusable: kind === "widgets",
    // The first click on a widget presses it, instead of only activating the window.
    acceptFirstMouse: true,
    // Media keys resume the music without a click in the page, which Chromium would otherwise block.
    webPreferences: webPreferences({ backgroundThrottling: false, autoplayPolicy: "no-user-gesture-required" }),
  });
  window.displayId = display.id;
  window.kind = kind;
  window.level = level;
  window.hotRects = [];
  window.isHot = false;
  window.isHovered = false;
  window.setIgnoreMouseEvents(true);
  window.loadURL(`${APP_URL}/renderer/${kind}/index.html?display=${display.id}`);
  window.once("ready-to-show", () => {
    pinToDesktop(window, window.level);
    window.setBounds(bounds);
    window.showInactive();
  });
  return window;
};

/** Which displays get which windows for this config. */
const wantedWindows = (config) => {
  const displays = screen.getAllDisplays();
  const wallpapers = config.wallpaper.mode === "off" ? [] : displays;
  return [
    ...wallpapers.map((display) => ({ kind: "wallpaper", display })),
    ...widgetDisplays(displays, screen.getPrimaryDisplay().id, config.general).map((display) => ({ kind: "widgets", display })),
  ];
};

export const syncDesktop = (config) => {
  const keep = new Set();
  for (const { kind, display } of wantedWindows(config)) {
    const key = `${kind}:${display.id}`;
    const level = levelFor(kind, config.general);
    keep.add(key);
    const existing = desktopWindows.get(key);
    if (!existing || existing.isDestroyed()) desktopWindows.set(key, createDesktopWindow(kind, display, level));
    else {
      existing.setBounds(boundsFor(kind, display));
      setLevel(existing, level);
    }
  }
  for (const [key, window] of desktopWindows) {
    if (keep.has(key)) continue;
    if (!window.isDestroyed()) window.destroy();
    desktopWindows.delete(key);
  }
};

/** Every live renderer, for broadcasting config changes. */
export const allWindows = () =>
  [...desktopWindows.values(), settingsWindow].filter((window) => window && !window.isDestroyed());

export const broadcast = (channel, payload) => {
  for (const window of allWindows()) window.webContents.send(channel, payload);
};

export const reloadDesktop = () => {
  for (const window of desktopWindows.values()) if (!window.isDestroyed()) window.webContents.reload();
};

export const setWidgetsHidden = (hidden) => {
  for (const window of desktopWindows.values()) {
    if (window.isDestroyed() || window.kind !== "widgets") continue;
    if (hidden) window.hide();
    else window.showInactive();
  }
};

const widgetsWindows = () => [...desktopWindows.values()].filter((window) => window.kind === "widgets");

/** The page says where its widgets are; pointer.js makes the window clickable there. */
export const setHotRects = (webContents, rects) => {
  const window = BrowserWindow.fromWebContents(webContents);
  if (window?.kind === "widgets") window.hotRects = cleanRects(rects);
};

export const startPointerTracking = (getPoint) => trackPointer(widgetsWindows, getPoint);

/** The connected displays, as the settings window lists them. */
export const listDisplays = () => {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map(({ id, label, size }, index) => ({
    id,
    label: label || `Display ${index + 1}`,
    size: `${size.width} × ${size.height}`,
    primary: id === primaryId,
  }));
};

export const openSettings = (section = "") => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (section) settingsWindow.webContents.send("settings:section", section);
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }
  settingsWindow = new BrowserWindow({
    width: 1000,
    height: 740,
    minWidth: 780,
    minHeight: 540,
    title: "Widgetian Settings",
    titleBarStyle: "hiddenInset",
    vibrancy: "sidebar",
    visualEffectState: "followWindow",
    backgroundColor: "#00000000",
    show: false,
    webPreferences: webPreferences(),
  });
  settingsWindow.loadURL(`${APP_URL}/renderer/settings/index.html${section ? `#${section}` : ""}`);
  settingsWindow.once("ready-to-show", () => settingsWindow.show());
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
  return settingsWindow;
};

export const getSettingsWindow = () =>
  settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow : null;
