import { DateTime } from "luxon";

/**
 * Start time for a fresh event: the next full hour when the date is today
 * (so "New event" is almost always correctly pre-filled), else 09:00.
 * Clamped to 23:00 when the next hour would roll into tomorrow.
 */
export function defaultStartTimeForDate(ymd: string, zone: string): string {
  const now = DateTime.now().setZone(zone);
  if (now.toISODate() !== ymd) return "09:00";
  const next = now.plus({ hours: 1 }).startOf("hour");
  if (next.toISODate() !== ymd) return "23:00";
  return next.toFormat("HH:mm");
}

/** Minutes-since-midnight → `HH:mm` for wall-time pre-fills. */
export function minutesToHm(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

/** End pre-fill for a slot-created event: start + 1h, or undefined past midnight. */
export function defaultEndTimeForSlot(startMinutes: number): string | undefined {
  const end = startMinutes + 60;
  return end < 24 * 60 ? minutesToHm(end) : undefined;
}
