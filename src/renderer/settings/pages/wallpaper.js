import { IMAGE_EFFECTS } from "../../../shared/config.js";
import { DEFAULT_THEME_ID, MAX_CUSTOM_THEMES, gradientOf, gradientsOf } from "../../../shared/wallpaper-themes.js";
import { h, icon, replace } from "../../shared/dom.js";
import { ICONS } from "../../shared/ui.js";
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
// Each effect brings its own way of changing pictures.
const EFFECT_HELP = {
  none: "Pictures cross-fade.",
  dim: "Darker pictures, so widgets stand out. A new picture rises out of the dark.",
  blur: "Soft, out-of-focus pictures. A new picture comes into focus as it appears.",
  drift: "Pictures move and zoom very slowly. A new picture settles in from a little closer.",
};

const newThemeId = () => `custom-${Math.random().toString(36).slice(2, 10)}`;

/** A gradient card: pick it, or hide it (hidden ones stay here, dimmed, but are offered nowhere else). */
const themeCard = (theme, settings, set) => {
  const current = settings.theme === theme.id;
  const toggleHidden = () =>
    set(
      {
        hiddenThemes: theme.hidden
          ? settings.hiddenThemes.filter((id) => id !== theme.id)
          : [...settings.hiddenThemes, theme.id],
      },
      { structural: true },
    );
  return h(
    "div",
    { class: "theme-item", dataset: { hidden: String(theme.hidden) } },
    h(
      "button",
      {
        type: "button",
        class: "theme-card",
        role: "radio",
        "aria-checked": String(current),
        "aria-disabled": theme.hidden ? "true" : null,
        title: theme.hidden ? "Hidden: show it to use it" : null,
        onClick: () => !theme.hidden && !current && set({ theme: theme.id }, { structural: true }),
      },
      h("span", { class: "theme-swatch", style: { background: swatchBackground(theme.colors) } }),
      h("strong", {}, theme.name),
      theme.origin ? h("small", {}, theme.origin) : null,
    ),
    // The gradient in use cannot be hidden: pick another first.
    current
      ? null
      : h(
          "button",
          {
            type: "button",
            class: "theme-hide",
            title: theme.hidden ? "Show" : "Hide",
            "aria-label": `${theme.hidden ? "Show" : "Hide"} ${theme.name}`,
            "aria-pressed": String(theme.hidden),
            onClick: toggleHidden,
          },
          icon(theme.hidden ? ICONS.eyeOff : ICONS.eye, { size: 14, stroke: 1.8 }),
        ),
  );
};

/** Name, colours and delete for the user's own gradient that is in use. */
const customRows = (ctx, theme, set) => {
  const change = (values, options) =>
    set(
      { customThemes: ctx.config.wallpaper.customThemes.map((entry) => (entry.id === theme.id ? { ...entry, ...values } : entry)) },
      options,
    );
  const setColor = (index, color) => change({ colors: theme.colors.map((other, at) => (at === index ? color : other)) });
  const colorInput = (color, index) =>
    h("input", { type: "color", value: color, "aria-label": `Colour ${index + 1}`, onChange: (event) => setColor(index, event.target.value) });
  const remove = () => {
    if (!window.confirm(`Delete the gradient “${theme.name}”?`)) return;
    const { customThemes, hiddenThemes } = ctx.config.wallpaper;
    set(
      {
        theme: DEFAULT_THEME_ID,
        customThemes: customThemes.filter((entry) => entry.id !== theme.id),
        hiddenThemes: hiddenThemes.filter((id) => id !== theme.id),
      },
      { structural: true },
    );
  };
  return [
    row(
      "Name",
      h("input", {
        type: "text",
        value: theme.name,
        maxLength: 40,
        spellcheck: false,
        onChange: (event) => change({ name: event.target.value.trim() || "Custom" }, { structural: true }),
      }),
    ),
    row("Colours", h("div", { class: "color-row" }, theme.colors.map(colorInput)), { help: "Four colours, blended into a slowly moving mesh." }),
    row("", h("button", { type: "button", class: "ghost danger small", onClick: remove }, "Delete gradient")),
  ];
};

const gradientGroup = (ctx, set) => {
  const settings = ctx.config.wallpaper;
  const themes = gradientsOf(settings);
  const current = gradientOf(settings, settings.theme);
  const addTheme = () => {
    const theme = { id: newThemeId(), name: `Custom ${settings.customThemes.length + 1}`, colors: [...current.colors] };
    set({ customThemes: [...ctx.config.wallpaper.customThemes, theme], theme: theme.id }, { structural: true });
  };
  const canAdd = settings.customThemes.length < MAX_CUSTOM_THEMES;
  return group(
    "Gradient",
    h(
      "div",
      { class: "theme-grid", role: "radiogroup", "aria-label": "Gradient" },
      themes.map((theme) => themeCard(theme, settings, set)),
      canAdd
        ? h(
            "button",
            { type: "button", class: "theme-new", title: "A new gradient, starting from the colours of the one in use", onClick: addTheme },
            icon(ICONS.plus, { size: 16, stroke: 2 }),
            "New gradient",
          )
        : null,
    ),
    h("p", { class: "help" }, "Hidden gradients stay here but the Wallpaper picker widget no longer offers them."),
    ...(current.custom && current.id === settings.theme ? customRows(ctx, current, set) : []),
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
        (imageEffect) => set({ imageEffect }, { structural: true }),
      ),
      { help: EFFECT_HELP[settings.imageEffect] },
    ),
    settings.imageEffect === "blur"
      ? row("Breathing", toggle(settings.imageBreathing, (imageBreathing) => set({ imageBreathing })), {
          help: "The blur slowly deepens and eases, as if the picture breathed.",
        })
      : null,
  );
};

export const wallpaperPage = (ctx) => {
  const { mode } = ctx.config.wallpaper;
  const set = (values, options) => updatePart(ctx, "wallpaper", values, options);
  const modes = [
    { value: "system", label: "System" },
    { value: "gradient", label: "Gradient" },
    { value: "images", label: "Images" },
  ];
  return page(
    "Wallpaper",
    "Widgetian can draw its own wallpaper on every display. With System, macOS shows the one you chose in System Settings, untouched.",
    group("", row("Wallpaper", segmented(mode, modes, (next) => set({ mode: next }, { structural: true }), "Wallpaper"))),
    mode === "gradient" ? gradientGroup(ctx, set) : null,
    mode === "images" ? imagesGroup(ctx, set) : null,
  );
};
