// Development only: `electron . --capture=<folder>` renders each page in a hidden window, saves a
// PNG of it and quits. It never shows anything on screen, so it is safe while someone uses the Mac.
// Renderer console output is printed, which makes it a quick smoke test too.
import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow } from "electron";
import { APP_URL } from "./protocols.js";
import { webPreferences } from "./windows.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const PAGES = [
  { name: "widgets", url: "renderer/widgets/index.html?preview=1", width: 1800, height: 1100, waitMs: 15000 },
  { name: "wallpaper", url: "renderer/wallpaper/index.html", width: 1200, height: 750, waitMs: 3000 },
  { name: "settings", url: "renderer/settings/index.html", width: 1000, height: 740, waitMs: 2500 },
];

const capturePage = async (folder, page) => {
  const window = new BrowserWindow({
    width: page.width,
    height: page.height,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: webPreferences({ backgroundThrottling: false }),
  });
  window.webContents.on("console-message", (event) => {
    const { level, message, sourceId, lineNumber } = event;
    const where = String(sourceId ?? "").split("/").slice(-2).join("/");
    console.log(`[${page.name}:${level}] ${message} (${where}:${lineNumber})`);
  });
  await window.loadURL(`${APP_URL}/${page.url}`);
  await delay(page.waitMs);
  const image = await window.webContents.capturePage();
  const file = path.join(folder, `${page.name}.png`);
  fs.writeFileSync(file, image.toPNG());
  console.log(`captured ${file} (${image.getSize().width}×${image.getSize().height})`);
  window.destroy();
};

/**
 * @param {string} folder where the PNGs go
 * @param {{ only?: string, section?: string, height?: number }} options only: "widgets,settings";
 *   section: a settings section such as "widget:clock"; height: a taller settings window to see more
 */
export const runCapture = async (folder, { only = "", section = "", height = 0 } = {}) => {
  fs.mkdirSync(folder, { recursive: true });
  for (const page of PAGES) {
    if (only && !only.split(",").includes(page.name)) continue;
    const settingsPage = page.name === "settings";
    const shown = {
      ...page,
      url: settingsPage && section ? `${page.url}#${encodeURIComponent(section)}` : page.url,
      height: settingsPage && height ? height : page.height,
    };
    try {
      await capturePage(folder, shown);
    } catch (error) {
      console.error(`capture ${page.name} failed:`, error);
    }
  }
  app.quit();
};
