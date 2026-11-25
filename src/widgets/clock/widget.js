// Clock: big time, optional seconds and date, any time zone. Ticks right after each second boundary
// so the seconds never drift.
import { h } from "../../renderer/shared/dom.js";
import { card } from "../../renderer/shared/ui.js";

const SECOND_MS = 1000;

const DATE_OPTIONS = {
  long: { weekday: "long", day: "numeric", month: "long" },
  medium: { weekday: "short", day: "numeric", month: "short", year: "numeric" },
  short: { dateStyle: "short" },
};

const isValidTimeZone = (zone) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

export function mount(root, ctx) {
  const { settings } = ctx;
  const timeZone = settings.timezone && isValidTimeZone(settings.timezone) ? settings.timezone : undefined;
  const hour12 = ctx.hour12(settings.timeFormat);
  const locale = ctx.locale ?? "en-GB";
  const timeParts = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12, timeZone });
  const dateLabel =
    settings.dateStyle === "iso"
      ? new Intl.DateTimeFormat("en-CA", { timeZone })
      : new Intl.DateTimeFormat(locale, { ...(DATE_OPTIONS[settings.dateStyle] ?? DATE_OPTIONS.long), timeZone });

  const hours = h("span");
  const minutes = h("span");
  const seconds = h("small", { class: "seconds" });
  const period = h("small", { class: "period" });
  const date = h("p", { class: "date" });
  const shell = card({ eyebrow: settings.label, className: "clock" });
  shell.body.append(
    h(
      "p",
      { class: "time", "aria-hidden": "true" },
      hours,
      h("em", {}, ":"),
      minutes,
      settings.showSeconds ? seconds : null,
      hour12 ? period : null,
    ),
    settings.showDate ? date : null,
  );
  root.append(shell.element);

  let timer = null;
  const tick = () => {
    const now = new Date();
    const parts = Object.fromEntries(timeParts.formatToParts(now).map((part) => [part.type, part.value]));
    hours.textContent = hour12 ? String(Number(parts.hour)) : parts.hour;
    minutes.textContent = parts.minute;
    seconds.textContent = parts.second;
    period.textContent = (parts.dayPeriod ?? "").toUpperCase();
    date.textContent = dateLabel.format(now);
    const label = settings.label ? `${settings.label}: ` : "";
    shell.element.setAttribute("aria-label", `${label}${hours.textContent}:${parts.minute}, ${date.textContent}`);
    timer = setTimeout(tick, SECOND_MS - (Date.now() % SECOND_MS) + 5);
  };
  tick();
  return () => clearTimeout(timer);
}
