// The pages of the settings window. Each page gets ctx and returns its content:
//   ctx.config                       the current config (always the latest, never a copy)
//   ctx.update(config => next, opts) saves a change; { structural: true } also redraws the page
//   ctx.go(section)                  opens another section
//   ctx.info                         facts from the main process (version, displays…)
// Changes must be written as functions of the config they receive: typing does not redraw the page,
// so a value remembered from when it was drawn may be old.
import { advancedPage } from "./pages/advanced.js";
import { generalPage } from "./pages/general.js";
import { layoutPage } from "./pages/layout.js";
import { wallpaperPage } from "./pages/wallpaper.js";
import { widgetPage } from "./pages/widget.js";

const WIDGET_PREFIX = "widget:";

export const SECTIONS = [
  { id: "general", label: "General", page: generalPage },
  { id: "layout", label: "Layout", page: layoutPage },
  { id: "wallpaper", label: "Wallpaper", page: wallpaperPage },
  { id: "advanced", label: "Advanced", page: advancedPage },
];

/** The sidebar entry a section belongs to: a widget's settings are part of Layout. */
export const sidebarSection = (section) => (SECTIONS.some(({ id }) => id === section) ? section : "layout");

/** section id → page content */
export const renderSection = (ctx, section) => {
  if (section.startsWith(WIDGET_PREFIX)) return widgetPage(ctx, section.slice(WIDGET_PREFIX.length));
  return SECTIONS.find(({ id }) => id === sidebarSection(section)).page(ctx);
};
