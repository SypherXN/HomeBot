import type { CalendarRangeItem } from "../api";

/** True when this occurrence should render greyed out (series completed or this instance completed). */
export function isGreyedOccurrence(ev: CalendarRangeItem): boolean {
  return ev.isCompleted === true || ev.isInstanceCompleted === true;
}
