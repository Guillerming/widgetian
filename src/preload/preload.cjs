// The only bridge between Widgetian's pages and the main process (see src/main/ipc.js).
// Sandboxed preloads must be CommonJS.
const { contextBridge, ipcRenderer } = require("electron");

/** invoke() that turns { ok, error } answers back into a rejected promise. */
const call = async (channel, ...args) => {
  const answer = await ipcRenderer.invoke(channel, ...args);
  if (!answer.ok) throw new Error(answer.error);
  return answer.value;
};

const subscribe = (channel) => (listener) => {
  const wrapped = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
};

contextBridge.exposeInMainWorld("widgetian", {
  config: {
    get: () => call("config:get"),
    save: (config) => call("config:save", config),
    onChange: subscribe("config:changed"),
    onInvalid: subscribe("config:invalid"),
  },
  widgets: {
    saveSettings: (widgetId, settings) => call("widget:save-settings", widgetId, settings),
  },
  wallpaper: {
    setTheme: (themeId) => call("wallpaper:set-theme", themeId),
    onBattery: subscribe("power:on-battery"),
  },
  source: (name, params, options) => call("source:read", name, params, options),
  status: {
    action: (widgetId, blockId, action) => call("status:action", widgetId, blockId, action),
    testScript: (code) => call("status:test-script", code),
  },
  chooseImage: () => call("dialog:choose-image"),
  chooseFolder: (defaultPath) => call("dialog:choose-folder", defaultPath),
  openExternal: (url) => call("shell:open-external", url),
  openConfigFile: () => call("shell:open-config"),
  openDesktopFolder: () => call("finder:open-desktop"),
  copy: (text) => call("clipboard:write", text),
  openSettings: (section) => call("settings:open", section),
  appInfo: () => call("app:info"),
  setHotRects: (rects) => ipcRenderer.send("desktop:hot-rects", rects),
  onDisplays: subscribe("displays:changed"),
  onSettingsSection: subscribe("settings:section"),
});
