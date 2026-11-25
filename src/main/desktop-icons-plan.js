// The decisions about the desktop icons, on their own so they can be tested without macOS or Electron.

/** What to do, given what is wanted, what macOS says and whether we hid them before. */
export const planFor = ({ wanted, hidden, ours }) => {
  if (wanted && !hidden) return "hide";
  if (!wanted && hidden && ours) return "show";
  return "nothing";
};

/**
 * Which of native.js's LEVELS a desktop window goes to. macOS shows hidden icons again whenever it
 * reveals the desktop (a click on the wallpaper, for instance), so the wallpaper also covers them.
 */
export const levelFor = (kind, { hideDesktopIcons }) => (kind === "wallpaper" && hideDesktopIcons ? "cover" : kind);
