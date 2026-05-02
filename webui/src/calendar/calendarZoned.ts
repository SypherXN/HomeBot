import { DateTime } from "luxon";

export type CalendarViewMode = "month" | "week" | "day" | "agenda";

/** When empty, use the browser's IANA zone. */
export function effectiveTimeZone(stored: string): string {
  const t = stored.trim();
  if (t) return t;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

export function ymdInZone(fromUtc: Date | string, zone: string): string {
  const dt =
    typeof fromUtc === "string"
      ? DateTime.fromISO(fromUtc, { zone: "utc" })
      : DateTime.fromJSDate(fromUtc, { zone: "utc" });
  return dt.setZone(zone).toISODate()!;
}

export function parseAnchorYmd(s: string | null, zone: string): string {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return DateTime.now().setZone(zone).toISODate()!;
}

export function todayYmd(zone: string): string {
  return DateTime.now().setZone(zone).toISODate()!;
}

export function addDaysYmd(ymd: string, n: number): string {
  return DateTime.fromISO(ymd).plus({ days: n }).toISODate()!;
}

export function addMonthsYmd(ymd: string, n: number): string {
  return DateTime.fromISO(ymd).plus({ months: n }).toISODate()!;
}

/** Sunday-first 6×7 grid containing the anchor month. */
export function monthGridRange(anchorYmd: string, zone: string): { fromYmd: string; toYmd: string } {
  const anchor = DateTime.fromISO(anchorYmd, { zone });
  const firstOfMonth = anchor.startOf("month");
  let gridStart = firstOfMonth;
  while (gridStart.weekday !== 7) {
    gridStart = gridStart.minus({ days: 1 });
  }
  const gridEndExclusive = gridStart.plus({ days: 42 });
  return { fromYmd: gridStart.toISODate()!, toYmd: gridEndExclusive.toISODate()! };
}

export function weekRangeSunday(anchorYmd: string, zone: string): { fromYmd: string; toYmd: string } {
  const anchor = DateTime.fromISO(anchorYmd, { zone }).startOf("day");
  let start = anchor;
  while (start.weekday !== 7) start = start.minus({ days: 1 });
  const end = start.plus({ days: 7 });
  return { fromYmd: start.toISODate()!, toYmd: end.toISODate()! };
}

export function dayRange(anchorYmd: string, zone: string): { fromYmd: string; toYmd: string } {
  const a = DateTime.fromISO(anchorYmd, { zone }).startOf("day");
  return { fromYmd: a.toISODate()!, toYmd: a.plus({ days: 1 }).toISODate()! };
}

export function agendaRange(anchorYmd: string, zone: string, days: number): { fromYmd: string; toYmd: string } {
  const a = DateTime.fromISO(anchorYmd, { zone }).startOf("day");
  return { fromYmd: a.toISODate()!, toYmd: a.plus({ days }).toISODate()! };
}

export function computeRangeQuery(
  view: CalendarViewMode,
  anchorYmd: string,
  zone: string,
  agendaDays: number
): { fromYmd: string; toYmd: string } {
  switch (view) {
    case "month":
      return monthGridRange(anchorYmd, zone);
    case "week":
      return weekRangeSunday(anchorYmd, zone);
    case "day":
      return dayRange(anchorYmd, zone);
    default:
      return agendaRange(anchorYmd, zone, agendaDays);
  }
}

export function formatMonthYearYmd(anchorYmd: string, zone: string): string {
  return DateTime.fromISO(anchorYmd, { zone }).toFormat("MMMM yyyy");
}

export function formatLongDateYmd(ymd: string, zone: string): string {
  return DateTime.fromISO(ymd, { zone }).toFormat("cccc, MMMM d, yyyy");
}

export function formatWeekRangeYmd(anchorYmd: string, zone: string): string {
  const { fromYmd, toYmd } = weekRangeSunday(anchorYmd, zone);
  const from = DateTime.fromISO(fromYmd, { zone });
  const to = DateTime.fromISO(toYmd, { zone }).minus({ days: 1 });
  if (from.month === to.month && from.year === to.year) {
    return `${from.toFormat("MMM d")}–${to.toFormat("d")}, ${String(to.year)}`;
  }
  return `${from.toFormat("MMM d")} – ${to.toFormat("MMM d")}, ${String(to.year)}`;
}

export function monthGridCells(
  anchorYmd: string,
  zone: string
): { ymd: string; inMonth: boolean; dayNum: number }[] {
  const anchor = DateTime.fromISO(anchorYmd, { zone });
  const month = anchor.month;
  const { fromYmd } = monthGridRange(anchorYmd, zone);
  const cells: { ymd: string; inMonth: boolean; dayNum: number }[] = [];
  let d = DateTime.fromISO(fromYmd, { zone });
  for (let i = 0; i < 42; i++) {
    cells.push({
      ymd: d.toISODate()!,
      inMonth: d.month === month,
      dayNum: d.day,
    });
    d = d.plus({ days: 1 });
  }
  return cells;
}

export function formatTimeInZone(isoUtc: string, zone: string): string {
  return DateTime.fromISO(isoUtc, { zone: "utc" }).setZone(zone).toFormat("h:mm a");
}

export function wallMinutesInZone(isoUtc: string, zone: string): number {
  const d = DateTime.fromISO(isoUtc, { zone: "utc" }).setZone(zone);
  return d.hour * 60 + d.minute;
}

export function ymdListForDays(fromYmd: string, zone: string, count: number): string[] {
  let d = DateTime.fromISO(fromYmd, { zone });
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(d.toISODate()!);
    d = d.plus({ days: 1 });
  }
  return out;
}
