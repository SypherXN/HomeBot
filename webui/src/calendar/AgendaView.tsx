import { useMemo } from "react";
import type { CalendarRangeItem } from "../api";
import { formatLongDateYmd, formatTimeInZone, rangeInstanceEndUtc, rangeInstanceStartUtc, ymdInZone } from "./calendarZoned";

type Props = {
  events: CalendarRangeItem[];
  displayZone: string;
  onPickEvent: (event: CalendarRangeItem) => void;
};

type DayBucket = { ymd: string; events: CalendarRangeItem[] };

export default function AgendaView({ events, displayZone, onPickEvent }: Props) {
  const buckets = useMemo(() => groupByDay(events, displayZone), [events, displayZone]);

  if (buckets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 px-4 py-12 text-center text-slate-400">
        No events in this window. Add one with the “New event” button.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {buckets.map((bucket) => (
        <section key={bucket.ymd}>
          <h3 className="border-b border-slate-800 pb-1 text-sm font-semibold text-slate-300">
            {formatLongDateYmd(bucket.ymd, displayZone)}
          </h3>
          <ul className="mt-2 space-y-2">
            {bucket.events.map((ev) => (
              <li key={`${ev.id}@${ev.instanceStartUtc}`}>
                <button
                  type="button"
                  onClick={() => onPickEvent(ev)}
                  className={`flex w-full flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-3 text-left hover:border-slate-700 hover:bg-slate-900/70 ${ev.isInstanceCompleted ? "opacity-70 line-through" : ""}`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium text-slate-100">
                      {ev.title}
                      {ev.isRecurringInstance && (
                        <span className="ml-2 rounded bg-blue-900/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-blue-200">
                          recurring
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {ev.allDay
                        ? "all-day"
                        : `${formatTimeInZone(rangeInstanceStartUtc(ev), displayZone)}${
                            rangeInstanceEndUtc(ev)
                              ? ` – ${formatTimeInZone(rangeInstanceEndUtc(ev)!, displayZone)}`
                              : ""
                          }`}
                    </span>
                  </div>
                  {ev.assignedToMemberLabel && (
                    <p className="text-xs text-slate-500">
                      Assigned to <span className="text-slate-300">{ev.assignedToMemberLabel}</span>
                    </p>
                  )}
                  {(ev.recurrenceText || ev.reminderText || ev.hasLink) && (
                    <p className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                      {ev.recurrenceText && <span>{ev.recurrenceText}</span>}
                      {ev.reminderText && <span>⏰ {ev.reminderText}</span>}
                      {ev.hasLink && <span>🔗 link</span>}
                    </p>
                  )}
                  {ev.timeZoneId && ev.timeZoneId !== displayZone && (
                    <p className="text-[11px] text-slate-600">Event TZ: {ev.timeZoneId}</p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function groupByDay(events: CalendarRangeItem[], displayZone: string): DayBucket[] {
  const sorted = [...events].sort((a, b) =>
    rangeInstanceStartUtc(a).localeCompare(rangeInstanceStartUtc(b))
  );
  const buckets: DayBucket[] = [];
  for (const ev of sorted) {
    const y = ymdInZone(rangeInstanceStartUtc(ev), displayZone);
    const last = buckets[buckets.length - 1];
    if (last && last.ymd === y) {
      last.events.push(ev);
    } else {
      buckets.push({ ymd: y, events: [ev] });
    }
  }
  return buckets;
}
