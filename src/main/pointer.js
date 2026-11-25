// Makes the widgets clickable while the rest of the desktop stays click-through.
//
// A widgets window covers the whole screen, so it must ignore the mouse except over a widget.
// Electron's setIgnoreMouseEvents({ forward: true }) would let the page decide, but Chromium drops
// mouse-move events in windows that are not the active one, which is always the case here until the
// first click. So the main process watches the pointer and compares it with the rectangles the page
// reports, and passes the movement on to the page so that hover styles work too.
import { screen } from "electron";
import { isInside } from "./hit-test.js";
import { isTopmostAt } from "./native.js";

const POLL_MS = 40;

const setHot = (window, hot) => {
  if (window.isHot === hot) return;
  window.isHot = hot;
  window.setIgnoreMouseEvents(!hot);
};

const passMovement = (window, point, local) => {
  // The active window already gets its own mouse events.
  if (window.isFocused()) return;
  const over = window.isHot && isTopmostAt(window, point);
  if (over) window.webContents.sendInputEvent({ type: "mouseMove", x: local.x, y: local.y });
  else if (window.isHovered) window.webContents.sendInputEvent({ type: "mouseLeave", x: local.x, y: local.y });
  window.isHovered = over;
};

const track = (window, point, moved) => {
  const { x, y } = window.getBounds();
  const local = { x: Math.round(point.x - x), y: Math.round(point.y - y) };
  setHot(window, isInside(local, window.hotRects ?? []));
  if (moved) passMovement(window, point, local);
};

/**
 * @param {() => import("electron").BrowserWindow[]} getWindows the widgets windows alive right now
 * @param {() => { x: number, y: number }} getPoint where the pointer is (replaceable in tests)
 */
export const trackPointer = (getWindows, getPoint = () => screen.getCursorScreenPoint()) => {
  let last = { x: NaN, y: NaN };
  const tick = () => {
    const point = getPoint();
    const moved = point.x !== last.x || point.y !== last.y;
    last = point;
    for (const window of getWindows()) {
      if (!window.isDestroyed() && window.isVisible()) track(window, point, moved);
    }
  };
  const timer = setInterval(tick, POLL_MS);
  return () => clearInterval(timer);
};
