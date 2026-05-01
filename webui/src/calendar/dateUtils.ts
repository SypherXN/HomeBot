/**
 * Local-time date helpers for the calendar UI.
 *
 * All Date objects produced by these helpers are anchored to the user's local timezone.
 * Server payloads carry UTC ISO strings (`...Z`); use {@link parseUtcIso} to convert.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Returns midnight (local) of the given date. */
export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Returns midnight (local) of the day after the given date. */
export function endOfDay(d: Date): Date {
  return addDays(startOfDay(d), 1);
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function addMonths(d: Date, n: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + n);
  return out;
}

/** Sunday-anchored start of the week containing `d` (local midnight). */
export function startOfWeek(d: Date): Date {
  const start = startOfDay(d);
  return addDays(start, -start.getDay());
}

export function startOfMonth(d: Date): Date {
  const out = startOfDay(d);
  out.setDate(1);
  return out;
}

/** End-of-month (next month's day 1) at local midnight. */
export function startOfNextMonth(d: Date): Date {
  return addMonths(startOfMonth(d), 1);
}

/** First cell of a 6x7 month grid (Sunday on or before the 1st). */
export function startOfMonthGrid(d: Date): Date {
  return startOfWeek(startOfMonth(d));
}

/** Exclusive end of a 6x7 month grid (start of the day after the 42nd cell). */
export function endOfMonthGrid(d: Date): Date {
  return addDays(startOfMonthGrid(d), 42);
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** YYYY-MM-DD in local time, suitable for the `from`/`to` query params on `/api/calendar/range`. */
export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parses an ISO 8601 UTC timestamp (`...Z`) into a local-anchored Date. */
export function parseUtcIso(s: string): Date {
  return new Date(s);
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const SHORT_MONTH = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatMonthYear(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatWeekRange(d: Date): string {
  const start = startOfWeek(d);
  const end = addDays(start, 6);
  if (start.getMonth() === end.getMonth()) {
    return `${SHORT_MONTH[start.getMonth()]} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${SHORT_MONTH[start.getMonth()]} ${start.getDate()} – ${SHORT_MONTH[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
}

export function formatLongDate(d: Date): string {
  const wd = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()];
  return `${wd}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "9:00 AM" style local time. */
export function formatLocalTime(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  const mm = String(m).padStart(2, "0");
  return `${h}:${mm} ${ampm}`;
}

/**
 * Builds the `<input type="datetime-local">` value for a Date in local time
 * (`YYYY-MM-DDTHH:mm`). The browser interprets the value back as local time on submit.
 */
export function toDateTimeLocalInput(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${da}T${h}:${mi}`;
}
