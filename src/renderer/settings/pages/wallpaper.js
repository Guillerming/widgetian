import { IMAGE_EFFECTS } from "../../../shared/config.js";
import { THEMES } from "../../../shared/wallpaper-themes.js";
import { h, replace } from "../../shared/dom.js";
import { renderField, row, segmented, select, toggle } from "../fields.js";
import { group, numberBox, page, updatePart } from "../kit.js";

const api = window.widgetian;

const swatchBackground = ([first, second, third, base]) =>
  [
    `radial-gradient(circle at 22% 24%, ${first} 0, transparent 64%)`,
    `radial-gradient(circle at 82% 30%, ${second} 0, transparent 62%)`,
    `radial-gradient(circle at 38% 88%, ${third} 0, transparent 64%)`,
    base,
  ].join(", ");

const EFFECT_LABELS = { none: "None", dim: "Dim", blur: "Blur", drift: "Slow drift" };

const gradientGroup = (ctx, set) => {
  const settings = ctx.config.wallpaper;
  const themes = [...THEMES, { id: "custom", name: "Custom", origin: "Your four colours", colors: settings.customColors }];
  const themeCard = (theme) =>
    h(
      "button",
      {
        type: "button",
        class: "theme-card",
        role: "radio",
        "aria-checked": String(settings.theme === theme.id),
        onClick: () => set({ theme: theme.id }, { structural: true }),
      },
      h("span", { class: "theme-swatch", style: { background: swatchBackground(theme.colors) } }),
      h("strong", {}, theme.name),
      h("small", {}, theme.origin),
    );
  const setColor = (index, color) =>
    set({ customColors: ctx.config.wallpaper.customColors.map((other, at) => (at === index ? color : other)) });
  const colorInput = (color, index) =>
    h("input", { type: "color", value: color, "aria-label": `Colour ${index + 1}`, onChange: (event) => setColor(index, event.target.value) });
  return group(
    "Gradient",
    h("div", { class: "theme-grid", role: "radiogroup", "aria-label": "Theme" }, themes.map(themeCard)),
    settings.theme === "custom"
      ? row("Colours", h("div", { class: "color-row" }, settings.customColors.map(colorInput)), { help: "Four colours, blended into a slowly moving mesh." })
      : null,
    row(
      "Movement",
      h("input", { type: "range", min: 0, max: 2, step: 0.1, value: settings.speed, onChange: (event) => set({ speed: Number(event.target.value) }) }),
      { help: "From still to twice the theme's own speed." },
    ),
    row("Pause on battery", toggle(settings.pauseOnBattery, (pauseOnBattery) => set({ pauseOnBattery })), {
      help: "Keeps the gradient still while the Mac runs on battery.",
    }),
  );
};

/** How many pictures the chosen folder has, so an empty or unreadable folder is not a mystery. */
const folderStatus = (folder) => {
  const status = h("p", { class: "help", role: "status" });
  const show = async (path) => {
    if (!path) return replace(status, "Choose a folder with pictures.");
    replace(status, "Looking for pictures…");
    const { images, error } = await api.source("count-images", { folder: path }).catch((problem) => ({ images: 0, error: problem.message }));
    return replace(status, error ?? (images === 1 ? "1 picture." : `${images} pictures.`));
  };
  show(folder);
  return { element: status, show };
};

const imagesGroup = (ctx, set) => {
  const settings = ctx.config.wallpaper;
  const status = folderStatus(settings.imagesFolder);
  const chooseFolder = (imagesFolder) => {
    set({ imagesFolder });
    status.show(imagesFolder);
  };
  return group(
    "Images",
    renderField(
      { key: "imagesFolder", label: "Folder", type: "folder", help: "jpg, png, webp, avif or gif, subfolders included." },
      settings.imagesFolder,
      chooseFolder,
      status.element,
    ),
    row("Change every", numberBox(settings.imageMinutes, 1, 1440, (imageMinutes) => set({ imageMinutes })), { help: "Minutes." }),
    row(
      "Effect",
      select(
        settings.imageEffect,
        IMAGE_EFFECTS.map((effect) => ({ value: effect, label: EFFECT_LABELS[effect] })),
        (imageEffect) => set({ imageEffect }),
      ),
    ),
  );
};

export const wallpaperPage = (ctx) => {
  const { mode } = ctx.config.wallpaper;
  const set = (values, options) => updatePart(ctx, "wallpaper", values, options);
  const modes = [
    { value: "off", label: "Off" },
    { value: "gradient", label: "Gradient" },
    { value: "images", label: "Images" },
  ];
  return page(
    "Wallpaper",
    "Widgetian draws its own wallpaper on every display. Turn it off to keep the one you have.",
    group("", row("Wallpaper", segmented(mode, modes, (next) => set({ mode: next }, { structural: true }), "Wallpaper"))),
    mode === "gradient" ? gradientGroup(ctx, set) : null,
    mode === "images" ? imagesGroup(ctx, set) : null,
  );
};
