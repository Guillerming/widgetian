import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarRange, expandCalendar } from "../src/main/sources/calendar.js";

// A synthetic calendar: a weekly meeting in London time with one week skipped (EXDATE) and one
// week moved (RECURRENCE-ID), an all-day event, a one-off event and a cancelled one.
const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Widgetian//Test//EN
X-WR-CALNAME:Work
BEGIN:VTIMEZONE
TZID:Europe/London
BEGIN:STANDARD
DTSTART:19701025T020000
TZOFFSETFROM:+0100
TZOFFSETTO:+0000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700329T010000
TZOFFSETFROM:+0000
TZOFFSETTO:+0100
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:weekly@test
SUMMARY:Weekly sync
DTSTART;TZID=Europe/London:20261102T100000
DTEND;TZID=Europe/London:20261102T103000
RRULE:FREQ=WEEKLY;BYDAY=MO
EXDATE;TZID=Europe/London:20261116T100000
END:VEVENT
BEGIN:VEVENT
UID:weekly@test
RECURRENCE-ID;TZID=Europe/London:20261123T100000
SUMMARY:Weekly sync (moved)
DTSTART;TZID=Europe/London:20261123T150000
DTEND;TZID=Europe/London:20261123T153000
END:VEVENT
BEGIN:VEVENT
UID:holiday@test
SUMMARY:Day off
DTSTART;VALUE=DATE:20261124
DTEND;VALUE=DATE:20261125
END:VEVENT
BEGIN:VEVENT
UID:dentist@test
SUMMARY:Dentist
DTSTART:20261123T180000Z
DTEND:20261123T183000Z
END:VEVENT
BEGIN:VEVENT
UID:cancelled@test
SUMMARY:Cancelled thing
STATUS:CANCELLED
DTSTART:20261123T120000Z
DTEND:20261123T130000Z
END:VEVENT
END:VCALENDAR`;

const range = (from, to) => ({ from: new Date(from), to: new Date(to) });

test("expands recurrences, applies exceptions and skips cancelled events", () => {
  const events = expandCalendar(ICS, { ...range("2026-11-23T00:00:00Z", "2026-11-25T00:00:00Z"), color: "#123456" });
  const titles = events.map((event) => event.title).sort();
  assert.deepEqual(titles, ["Day off", "Dentist", "Weekly sync (moved)"]);
  const moved = events.find((event) => event.title === "Weekly sync (moved)");
  assert.equal(moved.start, "2026-11-23T15:00:00.000Z"); // London is UTC+0 in November
  assert.equal(moved.calendar, "Work");
  assert.equal(moved.color, "#123456");
});

test("an EXDATE removes that week's occurrence", () => {
  const events = expandCalendar(ICS, range("2026-11-16T00:00:00Z", "2026-11-17T00:00:00Z"));
  assert.deepEqual(events, []);
});

test("regular weeks keep their time zone", () => {
  const [sync] = expandCalendar(ICS, range("2026-11-09T00:00:00Z", "2026-11-10T00:00:00Z"));
  assert.equal(sync.title, "Weekly sync");
  assert.equal(sync.start, "2026-11-09T10:00:00.000Z");
  assert.equal(sync.allDay, false);
});

test("all-day events are flagged", () => {
  const [dayOff] = expandCalendar(ICS, range("2026-11-24T06:00:00Z", "2026-11-24T07:00:00Z"));
  assert.equal(dayOff.title, "Day off");
  assert.equal(dayOff.allDay, true);
});

test("calendarRange starts at local midnight and spans whole days", () => {
  const { from, to } = calendarRange(2, new Date(2026, 10, 22, 15, 30));
  assert.equal(from.getHours(), 0);
  assert.equal(to.getDate(), 24);
});
