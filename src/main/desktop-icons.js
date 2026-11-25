// Hides the Finder's desktop icons with macOS's own setting (System Settings › Desktop & Dock ›
// Show Items › On Desktop, macOS 14+). It applies at once, without restarting the Finder.
//
// Widgetian only shows the icons again if it was Widgetian that hid them: a marker file remembers
// it, also after a crash.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { planFor } from "./desktop-icons-plan.js";

const DEFAULTS = "/usr/bin/defaults";
const SETTING = ["com.apple.WindowManager", "StandardHideDesktopIcons"];
const MIN_MACOS = 14;
const TIMEOUT_MS = 3000;

const markerFile = () => path.join(app.getPath("userData"), "desktop-icons-hidden");

export const canHideDesktopIcons = () => Number.parseInt(process.getSystemVersion(), 10) >= MIN_MACOS;

const areHidden = () => {
  try {
    return execFileSync(DEFAULTS, ["read", ...SETTING], { encoding: "utf8", timeout: TIMEOUT_MS, stdio: ["ignore", "pipe", "ignore"] }).trim() === "1";
  } catch {
    return false; // never set: macOS shows them
  }
};

const write = (hidden) => execFileSync(DEFAULTS, ["write", ...SETTING, "-bool", String(hidden)], { timeout: TIMEOUT_MS });

export const syncDesktopIcons = (wanted) => {
  if (!canHideDesktopIcons()) return;
  try {
    const ours = fs.existsSync(markerFile());
    // Nothing to ask macOS about for the many people who never use this.
    if (!wanted && !ours) return;
    const plan = planFor({ wanted, hidden: areHidden(), ours });
    if (plan === "hide") {
      fs.writeFileSync(markerFile(), "");
      write(true);
    } else if (plan === "show") write(false);
    if (!wanted) fs.rmSync(markerFile(), { force: true });
  } catch (error) {
    console.error("Could not change the desktop icons", error);
  }
};
