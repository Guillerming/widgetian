// Which displays show the widgets. Pure: takes Electron's Display objects, so it is easy to test.

/**
 * Display ids can change when a monitor is plugged back in, so the chosen one is matched by id and
 * then by name. If it is not connected, the main display stands in until it comes back.
 * @param {{ id: number, label: string }[]} displays
 * @param {number} primaryId
 * @param {{ display: "primary" | "all" | "one", displayId: number, displayLabel: string }} general
 */
export const widgetDisplays = (displays, primaryId, general) => {
  if (general.display === "all") return displays;
  const primary = displays.filter((display) => display.id === primaryId);
  if (general.display !== "one") return primary;
  const byId = displays.filter((display) => display.id === general.displayId);
  if (byId.length > 0 && (!general.displayLabel || byId[0].label === general.displayLabel)) return byId;
  const byLabel = displays.filter((display) => general.displayLabel && display.label === general.displayLabel).slice(0, 1);
  if (byLabel.length > 0) return byLabel;
  return byId.length > 0 ? byId : primary;
};

/**
 * The widgets window: as wide as the work area (clear of a side Dock and the menu bar) but down to
 * the real bottom of the screen, so the signature sits on the screen's margin and not on the Dock's.
 */
export const widgetsBounds = ({ bounds, workArea }) => ({
  x: workArea.x,
  y: workArea.y,
  width: workArea.width,
  height: bounds.y + bounds.height - workArea.y,
});
