import { row, segmented, select, toggle } from "../fields.js";
import { group, page, updatePart } from "../kit.js";

const LOCALES = [
  "ar", "bg-BG", "ca-ES", "cs-CZ", "da-DK", "de-AT", "de-CH", "de-DE", "el-GR", "en-AU", "en-CA", "en-GB", "en-IE", "en-IN",
  "en-US", "es-419", "es-AR", "es-CL", "es-CO", "es-ES", "es-MX", "eu-ES", "fi-FI", "fr-BE", "fr-CA", "fr-CH", "fr-FR",
  "gl-ES", "he-IL", "hi-IN", "hr-HR", "hu-HU", "id-ID", "it-IT", "ja-JP", "ko-KR", "nb-NO", "nl-BE", "nl-NL", "pl-PL",
  "pt-BR", "pt-PT", "ro-RO", "ru-RU", "sk-SK", "sl-SI", "sv-SE", "th-TH", "tr-TR", "uk-UA", "vi-VN", "zh-CN", "zh-TW",
];

const languageName = (tag) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "language", languageDisplay: "standard" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
};

const sampleDate = (tag) => {
  try {
    return new Intl.DateTimeFormat(tag || undefined, { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  } catch {
    return "";
  }
};

const localeOptions = (current) => {
  const tags = current && !LOCALES.includes(current) ? [...LOCALES, current] : LOCALES;
  const named = tags.map((value) => ({ value, label: languageName(value) })).sort((a, b) => a.label.localeCompare(b.label));
  return [{ value: "", label: `This Mac's: ${languageName(navigator.language)}` }, ...named];
};

// The select's values: "primary", "all" or "one:<display id>".
const displayValue = ({ display, displayId, displayLabel }, displays) => {
  if (display !== "one") return display;
  const chosen = displays.find((entry) => entry.id === displayId) ?? displays.find((entry) => entry.label === displayLabel);
  return `one:${chosen?.id ?? displayId}`;
};

const displayOptions = (settings, displays) => {
  const value = displayValue(settings, displays);
  const each = displays.map((entry) => ({ value: `one:${entry.id}`, label: `${entry.label} (${entry.size})` }));
  const missing = value.startsWith("one:") && !each.some((option) => option.value === value);
  const main = displays.find((entry) => entry.primary);
  return [
    { value: "primary", label: `Main display${main ? ` (now ${main.label})` : ""}` },
    ...each,
    ...(missing ? [{ value, label: `${settings.displayLabel || "Another display"} (not connected)` }] : []),
    { value: "all", label: "Every display" },
  ];
};

export const generalPage = (ctx) => {
  const settings = ctx.config.general;
  const set = (values, options) => updatePart(ctx, "general", values, options);
  const timeFormats = [
    { value: "24h", label: "24-hour" },
    { value: "12h", label: "12-hour" },
  ];
  const iconsHelp = [
    "While Widgetian is open. Your files stay in the Desktop folder; the Finder widget opens it.",
    ctx.config.wallpaper.mode === "off" ? "With Widgetian's wallpaper off, macOS shows them again when you click the desktop." : "",
  ].join(" ").trim();
  const chooseDisplay = (value) => {
    if (!value.startsWith("one:")) return set({ display: value });
    const displayId = Number(value.slice("one:".length));
    const displayLabel = ctx.info.displays.find((entry) => entry.id === displayId)?.label ?? settings.displayLabel;
    return set({ display: "one", displayId, displayLabel });
  };
  return page(
    "General",
    "How Widgetian starts, how it writes dates and times, and where it shows widgets.",
    group(
      "",
      row("Open at login", toggle(settings.openAtLogin, (openAtLogin) => set({ openAtLogin })), {
        help: "Starts Widgetian when you log in to this Mac.",
      }),
      row("Time format", segmented(settings.timeFormat, timeFormats, (timeFormat) => set({ timeFormat }, { structural: true }), "Time format")),
      row("Language for dates", select(settings.locale, localeOptions(settings.locale), (locale) => set({ locale }, { structural: true })), {
        help: `Example: ${sampleDate(settings.locale)}`,
      }),
    ),
    group(
      "Desktop",
      row("Show widgets on", select(displayValue(settings, ctx.info.displays), displayOptions(settings, ctx.info.displays), chooseDisplay), {
        help: "If the chosen display is not connected, the main one is used until it is back.",
      }),
      row("Hide desktop icons", toggle(settings.hideDesktopIcons, (hideDesktopIcons) => set({ hideDesktopIcons }), { disabled: !ctx.info.canHideDesktopIcons }), {
        help: ctx.info.canHideDesktopIcons ? iconsHelp : "Needs macOS 14 or later.",
      }),
    ),
  );
};
