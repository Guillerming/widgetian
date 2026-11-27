// What pages may ask the main process for. Pages are sandboxed and see only window.widgetian
// (preload.cjs); every request is checked here before it touches the disk, the shell or the network.
import { app, clipboard, dialog, ipcMain, powerMonitor, shell } from "electron";
import { updateWidgetSettings } from "../shared/config.js";
import { gradientsOf } from "../shared/wallpaper-themes.js";
import { PRODUCT } from "./product.js";
import { resourceFile } from "./resources.js";
import { readSource, defaultClaudeLimitsFile } from "./sources/index.js";
import { readStatusBlock, testScript } from "./sources/status.js";
import { canHideDesktopIcons } from "./desktop-icons.js";
import { checkForUpdates, installUpdate, updateState } from "./updater.js";
import { getSettingsWindow, listDisplays, openSettings, setHotRects } from "./windows.js";

const SELF_SAVING_TYPES = new Set(["todo"]);
const MAX_ACTION_LENGTH = 100;
/** Sources that take a path: only the settings window, where the user typed it, may ask for them. */
const SETTINGS_SOURCES = new Set(["count-images"]);

const widgetSettings = (config, widgetId, type) => {
  const widget = config.widgets.find((entry) => entry.id === widgetId && entry.type === type);
  if (!widget) throw new Error("Unknown widget");
  return widget.settings;
};

const statusBlock = (config, widgetId, blockId) => {
  const block = widgetSettings(config, widgetId, "status").blocks.find((entry) => entry.id === blockId);
  if (!block) throw new Error("Unknown block");
  return block;
};

/**
 * Sources that run commands, read folders or fetch configured addresses take their parameters from
 * config.json, by widget id, never from the page: what runs is only ever what the user configured.
 */
const CONFIGURED_SOURCES = {
  "status-block": (config, { widgetId, blockId }) => ({ widgetId, block: statusBlock(config, widgetId, blockId) }),
  logo: (config, { widgetId }) => ({ file: widgetSettings(config, widgetId, "status").logo }),
  calendar: (config, { widgetId }) => {
    const { calendars, daysAhead } = widgetSettings(config, widgetId, "calendar");
    return { calendars, daysAhead };
  },
  music: (config, { widgetId }) => ({ folder: widgetSettings(config, widgetId, "music").folder }),
  ai: (config, { widgetId }) => {
    const { claude, codex, claudeLive, claudeLimitsFile } = widgetSettings(config, widgetId, "ai");
    return { claude, codex, claudeLive, claudeLimitsFile };
  },
  images: (config) => ({ folder: config.wallpaper.imagesFolder }),
};

export const resolveSourceParams = (config, name, params) =>
  Object.hasOwn(CONFIGURED_SOURCES, name) ? CONFIGURED_SOURCES[name](config, params) : params;

/** The Claude Code statusLine command: Widgetian's own binary running resources/claude-statusline.cjs. */
const statuslineCommand = () => {
  const script = resourceFile("claude-statusline.cjs");
  const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  return `ELECTRON_RUN_AS_NODE=1 ${quote(process.execPath)} ${quote(script)} ${quote(defaultClaudeLimitsFile())}`;
};

const isSettings = (event) => getSettingsWindow()?.webContents === event.sender;

const requireSettings = (event) => {
  if (!isSettings(event)) throw new Error("Only the settings window can do that.");
};

const isWebUrl = (value) => {
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

/** Errors cross IPC as plain messages; the page decides how to show them. */
const handle = (channel, listener) =>
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return { ok: true, value: await listener(event, ...args) };
    } catch (error) {
      return { ok: false, error: error?.message ?? String(error) };
    }
  });

/**
 * @param {{ store: import("./config-store.js").ConfigStore }} deps
 */
export const registerIpc = ({ store }) => {
  handle("config:get", () => store.get());

  handle("config:save", (event, next) => {
    requireSettings(event);
    return store.save(next);
  });

  // A few widgets keep their own state in config.json (the to-do items). Only those may save from
  // the desktop, and only their own settings: a desktop page must never be able to add, say, a
  // shell command to a status card.
  handle("widget:save-settings", (_event, widgetId, settings) => {
    const widget = store.get().widgets.find((entry) => entry.id === widgetId);
    if (!widget) throw new Error("Unknown widget");
    if (!SELF_SAVING_TYPES.has(widget.type)) throw new Error("This widget's settings are changed in Settings.");
    return store.update((config) => updateWidgetSettings(config, widgetId, () => settings));
  });

  handle("wallpaper:set-theme", (_event, themeId) => {
    const theme = gradientsOf(store.get().wallpaper).find((entry) => entry.id === themeId);
    if (!theme || theme.hidden) throw new Error("Unknown theme");
    return store.update((config) => ({ ...config, wallpaper: { ...config.wallpaper, mode: "gradient", theme: themeId } }));
  });

  handle("source:read", (event, name, params, options) => {
    const source = String(name);
    if (SETTINGS_SOURCES.has(source)) requireSettings(event);
    return readSource(source, resolveSourceParams(store.get(), source, params ?? {}), options ?? {});
  });

  // A click in a script block: runs the configured script again, telling it what was clicked.
  handle("status:action", (_event, widgetId, blockId, action) => {
    const block = statusBlock(store.get(), widgetId, blockId);
    if (block.type !== "script") throw new Error("Only scripts have actions.");
    return readStatusBlock({ widgetId, block, action: String(action ?? "").slice(0, MAX_ACTION_LENGTH) });
  });

  handle("status:test-script", (event, code) => {
    requireSettings(event);
    return testScript(code);
  });

  handle("dialog:choose-image", async (event) => {
    requireSettings(event);
    const result = await dialog.showOpenDialog(getSettingsWindow(), {
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "svg", "webp", "avif", "gif"] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  handle("dialog:choose-folder", async (event, defaultPath) => {
    requireSettings(event);
    const start = typeof defaultPath === "string" && defaultPath ? defaultPath.replace(/^~(?=\/)/, app.getPath("home")) : undefined;
    const result = await dialog.showOpenDialog(getSettingsWindow(), {
      properties: ["openDirectory", "createDirectory"],
      defaultPath: start,
    });
    return result.canceled ? null : result.filePaths[0];
  });

  handle("shell:open-external", (_event, url) => {
    if (!isWebUrl(url)) throw new Error("Only web links can be opened.");
    return shell.openExternal(url);
  });

  handle("shell:open-config", (event) => {
    requireSettings(event);
    return shell.openPath(store.file);
  });

  // Always the Desktop folder: pages cannot choose what gets opened.
  handle("finder:open-desktop", async () => {
    const problem = await shell.openPath(app.getPath("desktop"));
    if (problem) throw new Error(problem);
    return true;
  });

  handle("clipboard:write", (_event, text) => {
    clipboard.writeText(String(text ?? ""));
    return true;
  });

  handle("settings:open", (_event, section) => {
    openSettings(typeof section === "string" ? section : "");
    return true;
  });

  handle("update:state", () => updateState());

  handle("update:check", (event) => {
    requireSettings(event);
    return checkForUpdates();
  });

  // Quits the app when it installs: only from the settings window, where the user clicked.
  handle("update:install", (event) => {
    requireSettings(event);
    return installUpdate();
  });

  handle("app:info", () => ({
    statuslineCommand: statuslineCommand(),
    version: app.getVersion(),
    configFile: store.file,
    claudeLimitsFile: defaultClaudeLimitsFile(),
    executable: process.execPath,
    isPackaged: app.isPackaged,
    onBattery: powerMonitor.isOnBatteryPower(),
    productPage: PRODUCT.page,
    displays: listDisplays(),
    canHideDesktopIcons: canHideDesktopIcons(),
  }));

  ipcMain.on("desktop:hot-rects", (event, rects) => setHotRects(event.sender, rects));
};
