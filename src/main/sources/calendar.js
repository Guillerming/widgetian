// Calendar events from iCal (.ics) addresses: Google's "secret address", iCloud public calendars,
// Outlook's published calendars… Recurring events, exceptions and time zones are expanded with ical.js.
import ICAL from "ical.js";
import { httpFetch } from "../http.js";

const TIMEOUT_MS = 15000;
const MAX_OCCURRENCES_PER_EVENT = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

const registerTimezones = (calendar) => {
  for (const zone of calendar.getAllSubcomponents("vtimezone")) {
    try {
      ICAL.TimezoneService.register(zone);
    } catch {
      // A malformed zone only affects its own events, which then read as floating time.
    }
  }
};

const isCancelled = (component) => component.getFirstPropertyValue("status") === "CANCELLED";

/** Masters with their exceptions (RECURRENCE-ID) related, so occurrences pick up moved/edited ones. */
const eventsOf = (calendar) => {
  const masters = new Map();
  const exceptions = [];
  for (const component of calendar.getAllSubcomponents("vevent")) {
    const event = new ICAL.Event(component);
    if (event.isRecurrenceException()) exceptions.push(event);
    else if (!isCancelled(component)) masters.set(event.uid, event);
  }
  for (const exception of exceptions) {
    const master = masters.get(exception.uid);
    if (master) master.relateException(exception);
    else if (!isCancelled(exception.component)) masters.set(`${exception.uid}#${exception.recurrenceId}`, exception);
  }
  return [...masters.values()];
};

const occurrence = (item, start, end, source) => ({
  title: item.summary || "Busy",
  start: start.toJSDate().toISOString(),
  end: end.toJSDate().toISOString(),
  allDay: start.isDate,
  location: item.location || "",
  calendar: source.name,
  color: source.color,
  google: source.google,
});

/**
 * Occurrences overlapping [from, to) for one .ics text.
 * @param {string} text
 * @param {{ from: Date, to: Date, name?: string, color?: string, google?: boolean }} options
 */
export const expandCalendar = (text, { from, to, name = "", color = "#4f8cff", google = false }) => {
  const calendar = new ICAL.Component(ICAL.parse(text));
  registerTimezones(calendar);
  const source = { name: name || calendar.getFirstPropertyValue("x-wr-calname") || "Calendar", color, google };
  const rangeEnd = ICAL.Time.fromJSDate(to, true);
  const overlaps = (start, end) => end.toJSDate() > from && start.toJSDate() < to;
  const found = [];

  for (const event of eventsOf(calendar)) {
    if (!event.startDate) continue;
    if (!event.isRecurring()) {
      const end = event.endDate ?? event.startDate;
      if (overlaps(event.startDate, end)) found.push(occurrence(event, event.startDate, end, source));
      continue;
    }
    const iterator = event.iterator();
    let next = iterator.next();
    for (let count = 0; next && count < MAX_OCCURRENCES_PER_EVENT; count += 1, next = iterator.next()) {
      if (next.compare(rangeEnd) > 0) break;
      const details = event.getOccurrenceDetails(next);
      if (isCancelled(details.item.component)) continue;
      if (overlaps(details.startDate, details.endDate)) {
        found.push(occurrence(details.item, details.startDate, details.endDate, source));
      }
    }
  }
  return found;
};

const addressOf = (url) => url.trim().replace(/^webcal:\/\//i, "https://");

const fetchText = async (url) => {
  const address = addressOf(url);
  if (!/^https?:\/\//i.test(address)) throw new Error("Calendar addresses must start with https://");
  const response = await httpFetch(address, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`The calendar answered ${response.status}`);
  return response.text();
};

/** Start of today (local) → `daysAhead` days later. */
export const calendarRange = (daysAhead, now = new Date()) => {
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(from.getDate() + Math.max(1, daysAhead));
  return { from, to };
};

/**
 * @param {{ calendars: { name: string, url: string, color: string }[], daysAhead: number }} params
 * @returns {Promise<{ events: object[], failed: string[] }>}
 */
export const readCalendars = async ({ calendars = [], daysAhead = 2 }) => {
  const { from, to } = calendarRange(daysAhead);
  const sources = calendars.filter((entry) => typeof entry.url === "string" && entry.url.trim());
  const results = await Promise.allSettled(
    sources.map(async (entry) =>
      expandCalendar(await fetchText(entry.url), {
        from,
        to,
        name: entry.name,
        color: entry.color,
        google: /calendar\.google\.com/i.test(entry.url),
      }),
    ),
  );
  const events = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const failed = sources.filter((_, index) => results[index].status === "rejected").map((entry) => entry.name || "A calendar");
  events.sort((a, b) => a.start.localeCompare(b.start) || Number(b.allDay) - Number(a.allDay));
  return { events, failed };
};

export { DAY_MS };
