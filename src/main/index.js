// Widgetian: glass desktop widgets for macOS.
// A menu bar app (no Dock icon) that keeps a wallpaper window and a widgets window on the desktop,
// and a settings window that edits config.json. See README.md for the architecture.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, Menu, Notification, Tray, nativeImage, powerMonitor, screen, session, shell } from "electron";
import { ConfigStore } from "./config-store.js";
import { registerIpc } from "./ipc.js";
import { PRODUCT } from "./product.js";
import { APP_URL, handleProtocols, registerSchemes } from "./protocols.js";
import { syncDesktopIcons } from "./desktop-icons.js";
import { startUpdater, updateState } from "./updater.js";
import { broadcast, listDisplays, openSettings, reloadDesktop, setWidgetsHidden, startPointerTracking, syncDesktop } from "./windows.js";

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../assets");
const DISPLAY_CHANGE_DEBOUNCE_MS = 500;

/** --name=value command-line flags (development). */
const flag = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;

// A separate data folder (config, caches), e.g. to try things without touching your own.
if (flag("user-data")) app.setPath("userData", path.resolve(flag("user-data")));

const store = new ConfigStore();
let tray = null;
let widgetsHidden = false;

const allowGeolocationForOurPages = () => {
  const ours = (url) => typeof url === "string" && url.startsWith(APP_URL);
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) =>
    callback(permission === "geolocation" && ours(details.requestingUrl ?? webContents.getURL())),
  );
  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission, origin) => permission === "geolocation" && ours(origin),
  );
};

/**
 * Open at login only applies to the packaged app (in development it would register Electron itself)
 * using its own data folder (a test instance must not change the real login item).
 */
const syncLoginItem = (config) => {
  if (app.isPackaged && !flag("user-data")) app.setLoginItemSettings({ openAtLogin: config.general.openAtLogin });
};

/** Test instances (their own data folder) leave the real desktop alone. */
const syncIcons = (hidden) => {
  if (!flag("user-data")) syncDesktopIcons(hidden);
};

const trayImage = () => {
  const file = path.join(ASSETS, "trayTemplate.png");
  if (!fs.existsSync(file)) return null;
  const image = nativeImage.createFromPath(file);
  image.setTemplateImage(true);
  return image;
};

const updateItems = () => {
  const { version } = updateState();
  return version ? [{ label: `Update to Widgetian ${version}…`, click: () => openSettings("about") }, { type: "separator" }] : [];
};

const buildTrayMenu = () =>
  Menu.buildFromTemplate([
    ...updateItems(),
    { label: "Settings…", accelerator: "Command+,", click: () => openSettings() },
    {
      label: widgetsHidden ? "Show Widgets" : "Hide Widgets",
      click: () => {
        widgetsHidden = !widgetsHidden;
        setWidgetsHidden(widgetsHidden);
        tray.setContextMenu(buildTrayMenu());
      },
    },
    { label: "Reload Widgets", click: () => reloadDesktop() },
    { type: "separator" },
    { label: "Open config.json", click: () => shell.openPath(store.file) },
    { label: `About Widgetian ${app.getVersion()}`, click: () => shell.openExternal(PRODUCT.page) },
    { type: "separator" },
    { label: "Quit Widgetian", accelerator: "Command+Q", click: () => app.quit() },
  ]);

const createTray = () => {
  const image = trayImage();
  tray = new Tray(image ?? nativeImage.createEmpty());
  if (!image) tray.setTitle("◧");
  tray.setToolTip("Widgetian");
  tray.setContextMenu(buildTrayMenu());
};

const debounce = (task, ms) => {
  let timer = null;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(task, ms);
  };
};

/** Arguments the app keeps when the updater opens it again (test instances stay test instances). */
const relaunchArgs = () =>
  [
    flag("user-data") ? `--user-data=${path.resolve(flag("user-data"))}` : "",
    flag("update-feed") ? `--update-feed=${flag("update-feed")}` : "",
  ].filter(Boolean);

const announceUpdate = ({ version }) => {
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title: `Widgetian ${version} is available`, body: "Click to see what's new and install it." });
  notification.on("click", () => openSettings("about"));
  notification.show();
};

const runUpdater = () => {
  let menuVersion = "";
  startUpdater({
    feed: flag("update-feed"),
    relaunchArgs: relaunchArgs(),
    // Testing only: install whatever the test feed offers, without clicking.
    installRightAway: Boolean(flag("update-feed")) && process.argv.includes("--update-install"),
    isEnabled: () => store.get().general.checkForUpdates,
    onChange: (state) => {
      broadcast("update:changed", state);
      if (state.version === menuVersion) return;
      menuVersion = state.version;
      tray?.setContextMenu(buildTrayMenu());
    },
    onAvailable: announceUpdate,
    openPage: (url) => shell.openExternal(url),
  });
};

async function start() {
  handleProtocols();
  allowGeolocationForOurPages();
  const config = store.load();
  store.watch();
  registerIpc({ store });

  store.on("change", (next) => {
    broadcast("config:changed", next);
    syncDesktop(next);
    syncLoginItem(next);
    syncIcons(next.general.hideDesktopIcons);
  });
  store.on("invalid", (message) => broadcast("config:invalid", message));

  const resync = debounce(() => {
    syncDesktop(store.get());
    broadcast("displays:changed", listDisplays());
  }, DISPLAY_CHANGE_DEBOUNCE_MS);
  for (const event of ["display-added", "display-removed", "display-metrics-changed"]) screen.on(event, resync);
  powerMonitor.on("on-battery", () => broadcast("power:on-battery", true));
  powerMonitor.on("on-ac", () => broadcast("power:on-battery", false));

  // Before captures too, so they show the update status.
  runUpdater();

  if (flag("capture")) {
    const { runCapture } = await import("./capture.js");
    await runCapture(path.resolve(flag("capture")), {
      only: flag("only") ?? "",
      section: flag("section") ?? "",
      height: Number(flag("height")) || 0,
    });
    return;
  }

  createTray();
  syncDesktop(config);
  startPointerTracking();
  syncLoginItem(config);
  syncIcons(config.general.hideDesktopIcons);
  if (store.isFirstRun || process.argv.includes("--settings")) openSettings();
}

registerSchemes();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => openSettings());
  app.dock?.hide();
  app.whenReady().then(start);
  // Closing the settings window must not quit a menu bar app.
  app.on("window-all-closed", () => {});
  app.on("before-quit", () => store.close());
  // Widgetian hides the icons only while it runs.
  app.on("will-quit", () => syncIcons(false));
}
