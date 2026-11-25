// Calendar: upcoming events from iCal addresses, grouped by day, the current one highlighted.
// Clicking an event from a Google calendar opens that day in Google Calendar.
import { h, replace } from "../../renderer/shared/dom.js";
import { card, notice, openLink } from "../../renderer/shared/ui.js";

const REFRESH_MS = 2 * 60 * 1000;
const RERENDER_MS = 30 * 1000;

const dayKey = (date) => date.toDateString();

const googleDayUrl = (date) =>
  `https://calendar.google.com/calendar/r/day/${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;

/** One row per meeting: the same invite in several calendars shows once. */
const unique = (events) => {
  const seen = new Map();
  for (const event of events) {
    const key = `${event.title}|${event.start}|${event.end}`;
    if (!seen.has(key)) seen.set(key, event);
  }
  return [...seen.values()];
};

/** Not-yet-ended events grouped under "Today", "Tomorrow" or the weekday. */
export const groupUpcoming = (events, { now, maxEvents, showAllDay, dayLabel }) => {
  const groups = [];
  unique(events)
    .map((event) => ({ ...event, start: new Date(event.start), end: new Date(event.end) }))
    .filter((event) => event.end > now && (showAllDay || !event.allDay))
    .slice(0, maxEvents)
    .forEach((event) => {
      const label = dayLabel(event.start < now ? now : event.start, now);
      const group = groups.find((entry) => entry.label === label);
      if (group) group.events.push(event);
      else groups.push({ label, events: [event] });
    });
  return groups;
};

const eventRow = (event, now, clock) => {
  const happening = !event.allDay && event.start <= now;
  let when = clock.format(event.start);
  if (event.allDay) when = "All day";
  else if (happening) when = "Now";
  const content = [
    h("i", { style: { background: event.color }, "aria-hidden": "true" }),
    h("time", {}, when),
    h("span", { class: "separator", "aria-hidden": "true" }, "•"),
    h("span", { class: "title" }, event.title),
  ];
  const title = [event.calendar, event.location].filter(Boolean).join(" · ");
  const body = event.google
    ? h("button", { type: "button", title: `${title} · open in Google Calendar`, onClick: () => openLink(googleDayUrl(event.start)) }, content)
    : h("div", { title }, content);
  return h("li", { dataset: happening ? { now: "true" } : {} }, body);
};

export function mount(root, ctx) {
  const { settings } = ctx;
  const locale = ctx.locale ?? "en-GB";
  const clock = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: ctx.hour12(settings.timeFormat) });
  const dayName = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "short" });
  const dayLabel = (date, now) => {
    if (dayKey(date) === dayKey(now)) return "Today";
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    return dayKey(date) === dayKey(tomorrow) ? "Tomorrow" : dayName.format(date);
  };

  const shell = card({ eyebrow: "Calendar", className: "calendar" });
  root.append(shell.element);

  if (!settings.calendars.some((entry) => entry.url)) {
    replace(
      shell.body,
      notice("Add a calendar's iCal address to see your events here."),
      h("button", { class: "link-button", type: "button", onClick: ctx.openSettings }, "Add a calendar"),
    );
    return undefined;
  }

  let latest = null;
  const render = () => {
    if (!latest) return;
    const now = new Date();
    const groups = groupUpcoming(latest.events, { now, maxEvents: settings.maxEvents, showAllDay: settings.showAllDay, dayLabel });
    shell.setAside(latest.failed.length ? `${latest.failed.join(", ")} unavailable` : "");
    if (groups.length === 0) {
      const when = settings.daysAhead === 1 ? "today" : `in the next ${settings.daysAhead} days`;
      replace(shell.body, notice(`Nothing left ${when}.`));
      return;
    }
    replace(
      shell.body,
      groups.map((group) =>
        h(
          "section",
          { class: "day", "aria-label": group.label },
          h("h2", {}, group.label),
          h("ul", {}, group.events.map((event) => eventRow(event, now, clock))),
        ),
      ),
    );
  };

  replace(shell.body, notice("One moment…"));
  ctx.every(REFRESH_MS, async () => {
    try {
      latest = await ctx.api.source("calendar", { widgetId: ctx.id });
      render();
    } catch {
      if (!latest) replace(shell.body, notice("Couldn't read the calendar."));
    }
  });
  const timer = setInterval(render, RERENDER_MS);
  return () => clearInterval(timer);
}
