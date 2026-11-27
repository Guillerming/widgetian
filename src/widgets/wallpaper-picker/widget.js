// Wallpaper picker: one swatch per gradient theme. Picking one saves it and the wallpaper
// cross-fades to it on every screen. Hovering a swatch previews its name.
import { gradientsOf } from "../../shared/wallpaper-themes.js";
import { h, replace } from "../../renderer/shared/dom.js";
import { card } from "../../renderer/shared/ui.js";

/** A tiny mesh-gradient preview of a theme's four colours. */
const swatchBackground = ([first, second, third, base]) =>
  [
    `radial-gradient(circle at 22% 24%, ${first} 0, transparent 64%)`,
    `radial-gradient(circle at 82% 30%, ${second} 0, transparent 62%)`,
    `radial-gradient(circle at 38% 88%, ${third} 0, transparent 64%)`,
    base,
  ].join(", ");

export function mount(root, ctx) {
  const shell = card({ eyebrow: "Wallpaper", className: "wallpaper-picker" });
  const swatches = h("div", { class: "swatches", role: "radiogroup", "aria-label": "Wallpaper theme" });
  shell.body.append(swatches);
  root.append(shell.element);

  let wallpaper = null;
  let previewId = null;

  /** Hidden gradients are not offered, unless it is the one on screen. */
  const themesShown = () =>
    wallpaper ? gradientsOf(wallpaper).filter((theme) => !theme.hidden || (wallpaper.mode === "gradient" && theme.id === wallpaper.theme)) : [];

  const label = () => {
    const id = previewId ?? (wallpaper?.mode === "gradient" ? wallpaper.theme : null);
    const theme = themesShown().find((entry) => entry.id === id);
    if (!theme) return shell.setAside(wallpaper?.mode === "images" ? "Images" : "System");
    return shell.setAside(h("strong", {}, theme.name), theme.origin ? h("small", {}, theme.origin) : null);
  };

  const preview = (id) => {
    previewId = id;
    label();
  };

  const pick = (id) => {
    if (wallpaper?.mode === "gradient" && wallpaper.theme === id) return;
    ctx.api.wallpaper.setTheme(id).catch(() => shell.setAside("Couldn't save"));
  };

  const swatch = (theme, current) =>
    h("button", {
      type: "button",
      role: "radio",
      class: "swatch",
      "aria-checked": String(theme.id === current),
      "aria-label": theme.origin ? `${theme.name}, ${theme.origin}` : theme.name,
      style: { background: swatchBackground(theme.colors) },
      onMouseenter: () => preview(theme.id),
      onFocus: () => preview(theme.id),
      onBlur: () => preview(null),
      onClick: () => pick(theme.id),
    });

  const render = () => {
    const current = wallpaper?.mode === "gradient" ? wallpaper.theme : null;
    replace(swatches, themesShown().map((theme) => swatch(theme, current)));
    label();
  };

  swatches.addEventListener("mouseleave", () => preview(null));

  const apply = (config) => {
    wallpaper = config.wallpaper;
    render();
  };
  ctx.api.config.get().then(apply);
  ctx.onCleanup(ctx.api.config.onChange(apply));
}
