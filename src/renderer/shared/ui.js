// Building blocks shared by the desktop widgets: the glass card, rings, notices and formatters.
import { h, icon, replace } from "./dom.js";

export const ICONS = {
  check: "m5 12 4.5 4.5L19 7",
  cross: "M7 7l10 10M17 7 7 17",
  clock: "M12 7.5V12l3 2M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  external: "M14 5h5v5M19 5l-8 8M17 14v5H5V7h5",
  chevron: "m9 6 6 6-6 6",
  play: "M8 5.5v13l10-6.5-10-6.5Z",
  refresh: "M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4",
  copy: "M9 9h10v10H9V9Zm-4 6V5h10",
  plus: "M12 5v14M5 12h14",
  trash: "M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12",
  rocket: "M12 15l-3-3a12 12 0 0 1 9-8 12 12 0 0 1-8 9Zm-3-3H5l2-4h4m1 7v4l4-2v-4M6 17c-1 1-1 3-1 3s2 0 3-1",
};

export const TONE_ICON = { good: "check", bad: "cross", wait: "clock" };

/**
 * The glass card every widget lives in.
 * @returns {{ element: HTMLElement, body: HTMLElement, setAside: Function, setEyebrow: Function }}
 */
export const card = ({ eyebrow = "", label = eyebrow, className = "" } = {}) => {
  const eyebrowElement = h("span", { class: "eyebrow" }, eyebrow);
  const aside = h("span", { class: "aside" });
  const body = h("div", { class: "card-body" });
  const element = h(
    "section",
    { class: `glass ${className}`.trim(), "aria-label": label || null },
    h("header", { class: "card-head" }, eyebrowElement, aside),
    body,
  );
  return {
    element,
    body,
    setAside: (...children) => replace(aside, ...children),
    setEyebrow: (text) => {
      eyebrowElement.textContent = text;
    },
  };
};

export const notice = (text) => h("p", { class: "notice" }, text);

/** A progress ring: `percent` of the circle filled (null = dashed, unknown). */
export const ring = ({ percent = null, size = 52, stroke = 4, tone = "normal", className = "", children = null }) => {
  const radius = 24 - stroke / 2 - 1;
  return h(
    "span",
    { class: `ring ${className}`.trim(), dataset: { tone }, style: { width: `${size}px`, height: `${size}px` } },
    h(
      "svg",
      { viewBox: "0 0 48 48", "aria-hidden": "true", "stroke-width": stroke },
      h("circle", { class: "ring-track", cx: 24, cy: 24, r: radius }),
      percent === null
        ? null
        : h("circle", {
            class: "ring-arc",
            cx: 24,
            cy: 24,
            r: radius,
            pathLength: 100,
            "stroke-dasharray": 100,
            "stroke-dashoffset": 100 - Math.max(0, Math.min(100, percent)),
          }),
    ),
    h("span", { class: "ring-center" }, children),
  );
};

export const toneIcon = (tone, size = 11) => icon(ICONS[TONE_ICON[tone] ?? "clock"], { size, stroke: 2 });

/** "1 h 5 m" / "12 m" */
export const hoursAndMinutes = (minutes) =>
  minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} m` : `${minutes} m`;

/** 0:00 */
export const clockDuration = (seconds) => {
  const total = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** "3 min ago" for an ISO date. */
export const relativeTime = (iso, now = Date.now()) => {
  const minutes = Math.round((now - Date.parse(iso)) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
};

/** Opens a web link through the main process (pages cannot open URLs themselves). */
export const openLink = (url) => window.widgetian.openExternal(url).catch(() => {});
