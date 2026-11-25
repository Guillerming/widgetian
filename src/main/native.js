// Window levels Electron does not expose, set through the Objective-C runtime with koffi.
//
// Electron can only raise windows above the normal level. Widgetian needs three levels below it:
//   - wallpaper: the desktop level itself, under the Finder's icons, so the icons draw on top of it;
//   - cover:     just above the icons, for a wallpaper that hides them;
//   - widgets:   above both, so they stay clickable but sit under every app.
// getNativeWindowHandle() returns the NSView of the window; we ask it for its NSWindow and call
// -setLevel: and -setCollectionBehavior: on it. This runs on the main thread (Electron's main process).
import { screen } from "electron";
import koffi from "koffi";

const objc = koffi.load("/usr/lib/libobjc.A.dylib");
const coreGraphics = koffi.load("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics");

const selRegisterName = objc.func("void *sel_registerName(const char *name)");
// objc_msgSend must be declared with the exact prototype of each call (required on arm64).
const sendPointer = objc.func("objc_msgSend", "void *", ["void *", "void *"]);
const sendLong = objc.func("objc_msgSend", "void", ["void *", "void *", "long"]);
const sendUnsignedLong = objc.func("objc_msgSend", "void", ["void *", "void *", "unsigned long"]);
const CGPoint = koffi.struct("CGPoint", { x: "double", y: "double" });
const getClass = objc.func("void *objc_getClass(const char *name)");
const sendForLong = objc.func("objc_msgSend", "long", ["void *", "void *"]);
const sendPointForLong = objc.func("objc_msgSend", "long", ["void *", "void *", CGPoint, "long"]);
const windowLevelForKey = coreGraphics.func("int CGWindowLevelForKey(int key)");

// CGWindowLevelKey values (CGWindowLevel.h).
const DESKTOP_LEVEL_KEY = 2;
const DESKTOP_ICON_LEVEL_KEY = 18;

// NSWindowCollectionBehavior flags.
const CAN_JOIN_ALL_SPACES = 1 << 0;
const STATIONARY = 1 << 4; // stays put in Mission Control / Show Desktop
const IGNORES_CYCLE = 1 << 6; // not reachable with Cmd-`
const BEHAVIOR = CAN_JOIN_ALL_SPACES | STATIONARY | IGNORES_CYCLE;

export const LEVELS = {
  wallpaper: windowLevelForKey(DESKTOP_LEVEL_KEY),
  cover: windowLevelForKey(DESKTOP_ICON_LEVEL_KEY) + 1,
  widgets: windowLevelForKey(DESKTOP_ICON_LEVEL_KEY) + 2,
};

const nsWindowOf = (browserWindow) => {
  const handle = browserWindow.getNativeWindowHandle();
  const view = koffi.decode(handle, "void *");
  return sendPointer(view, selRegisterName("window"));
};

/**
 * Pins a BrowserWindow to one of LEVELS on every Space.
 * @param {import("electron").BrowserWindow} browserWindow
 * @param {keyof typeof LEVELS} level
 */
export const pinToDesktop = (browserWindow, level) => {
  const nsWindow = nsWindowOf(browserWindow);
  if (!nsWindow) throw new Error("No native window to pin");
  sendLong(nsWindow, selRegisterName("setLevel:"), LEVELS[level]);
  sendUnsignedLong(nsWindow, selRegisterName("setCollectionBehavior:"), BEHAVIOR);
};

/**
 * Whether a click at `point` (screen coordinates) would land on this window: no app window, menu or
 * Dock covers it there. AppKit measures from the bottom of the main display.
 */
export const isTopmostAt = (browserWindow, point) => {
  const flipped = { x: point.x, y: screen.getPrimaryDisplay().bounds.height - point.y };
  const top = sendPointForLong(getClass("NSWindow"), selRegisterName("windowNumberAtPoint:belowWindowWithWindowNumber:"), flipped, 0);
  return Number(top) === Number(sendForLong(nsWindowOf(browserWindow), selRegisterName("windowNumber")));
};
