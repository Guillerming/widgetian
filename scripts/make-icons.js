// Renders Widgetian's icons from HTML/CSS in a hidden window: `npx electron scripts/make-icons.js`
//   build/icon.png              1024×1024 app icon (electron-builder turns it into the .icns)
//   assets/trayTemplate.png     18×18 menu bar icon (a macOS template image: black + alpha)
//   assets/trayTemplate@2x.png  36×36
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const glassCard = ([left, top, width, height]) =>
  `<div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;border-radius:52px;
  background:linear-gradient(145deg,rgba(255,255,255,.42),rgba(255,255,255,.14) 55%);box-shadow:inset 0 0 0 3px rgba(255,255,255,.35)"></div>`;

const bar = ([left, top, width, opacity]) =>
  `<div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:18px;border-radius:9px;background:rgba(255,255,255,${opacity})"></div>`;

// A Big Sur-style squircle with the default wallpaper and three glass widgets: a clock, a ring, a list.
const APP_ICON = `
<body style="margin:0;width:1024px;height:1024px;background:transparent;overflow:hidden">
<div style="position:absolute;left:100px;top:100px;width:824px;height:824px;border-radius:185px;overflow:hidden;
  background:radial-gradient(circle at 22% 20%,#ff9a54 0,transparent 58%),radial-gradient(circle at 85% 28%,#85c8e8 0,transparent 55%),
  radial-gradient(circle at 30% 95%,#7a3fb0 0,transparent 55%),linear-gradient(135deg,#fa4b3e,#285c9e);
  box-shadow:inset 0 0 0 4px rgba(255,255,255,.18)">
  ${[[88, 120, 300, 250], [88, 400, 300, 300], [418, 120, 318, 580]].map(glassCard).join("")}
  <div style="position:absolute;left:118px;top:170px;font:200 124px -apple-system,sans-serif;color:#fff;letter-spacing:-6px">9:41</div>
  <div style="position:absolute;left:470px;top:180px;width:214px;height:214px;border-radius:50%;border:22px solid rgba(255,255,255,.3);box-sizing:border-box"></div>
  <div style="position:absolute;left:470px;top:180px;width:214px;height:214px;border-radius:50%;border:22px solid;border-color:#fff #fff transparent transparent;box-sizing:border-box;transform:rotate(25deg)"></div>
  ${[[470, 460, 214, 0.85], [470, 510, 150, 0.55], [470, 560, 190, 0.55], [470, 610, 120, 0.55]].map(bar).join("")}
  ${[[120, 470, 236, 0.8], [120, 520, 170, 0.5], [120, 570, 200, 0.5], [120, 620, 140, 0.5]].map(bar).join("")}
</div></body>`;

// Menu bar glyph: three cards in two columns, black on transparent (macOS tints template images).
const trayIcon = (size) => {
  const unit = size / 18;
  const card = (left, top, width, height) =>
    `<div style="position:absolute;left:${left * unit}px;top:${top * unit}px;width:${width * unit}px;height:${height * unit}px;border-radius:${2 * unit}px;background:#000"></div>`;
  return `<body style="margin:0;width:${size}px;height:${size}px;background:transparent">${card(2, 2.5, 6.5, 5.5)}${card(2, 9.5, 6.5, 6)}${card(10, 2.5, 6, 13)}</body>`;
};

const render = async (html, size, file) => {
  const window = new BrowserWindow({ width: size, height: size, show: false, transparent: true, frame: false, useContentSize: true });
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const image = await window.webContents.capturePage();
  const exact = image.resize({ width: size, height: size, quality: "best" });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, exact.toPNG());
  console.log(`wrote ${path.relative(ROOT, file)} (${exact.getSize().width}×${exact.getSize().height})`);
  window.destroy();
};

app.dock?.hide();
// Each icon window is destroyed after its capture: do not quit until all are done.
app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
  await render(APP_ICON, 1024, path.join(ROOT, "build/icon.png"));
  await render(trayIcon(18), 18, path.join(ROOT, "assets/trayTemplate.png"));
  await render(trayIcon(36), 36, path.join(ROOT, "assets/trayTemplate@2x.png"));
  app.quit();
});
