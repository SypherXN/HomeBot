import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import type { CalendarRangeItem } from "../api";
import { formatTimeInZone, rangeInstanceEndUtc, rangeInstanceStartUtc, wallMinutesInZone, ymdInZone } from "./calendarZoned";
import { isGreyedOccurrence } from "./occurrenceStyle";

type Props = {
  /** Calendar columns as `YYYY-MM-DD` in <see cref="displayZone"/>. */
  dayYmds: string[];
  displayZone: string;
  events: CalendarRangeItem[];
  onPickEvent: (event: CalendarRangeItem) => void;
  /** When set (e.g. week view), day headers open that day. */
  onPickDay?: (ymd: string) => void;
  /** Clicking an empty time slot — minutes since midnight, snapped to 30. */
  onCreateSlot?: (ymd: string, startMinutes: number) => void;
  /** Clicking an empty spot in the all-day row. */
  onCreateAllDay?: (ymd: string) => void;
};

const HOUR_START = 6;
const HOUR_END = 23;
const HOUR_HEIGHT_PX = 44;
const NOW_TICK_MS = 60_000;

export default function TimeGridView({ dayYmds, displayZone, events, onPickEvent, onPickDay, onCreateSlot, onCreateAllDay }: Props) {
  const partition = useMemo(
    () => splitAllDayAndTimed(events, dayYmds, displayZone),
    [events, dayYmds, displayZone]
  );
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), NOW_TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  const todayYmd = ymdInZone(now, displayZone);
  const nowLineMin = wallMinutesInZone(now.toISOString(), displayZone) - HOUR_START * 60;
  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

  const dayLabels = dayYmds.map((ymd) => {
    const d = DateTime.fromISO(ymd, { zone: displayZone });
    return {
      ymd,
      label: d.toFormat("ccc"),
      dayNum: d.day,
      isToday: ymd === todayYmd,
    };
  });

  return (
    <div className="overflow-hidden hb-card">
      <div
        className="grid border-b border-slate-800 bg-slate-900/60 text-center text-xs"
        style={{ gridTemplateColumns: `64px repeat(${dayYmds.length}, minmax(0, 1fr))` }}
      >
        <div className="border-r border-slate-800 px-2 py-2 text-slate-500">All-day</div>
        {dayLabels.map((d) => (
          <button
            key={d.ymd}
            type="button"
            disabled={!onPickDay}
            onClick={() => onPickDay?.(d.ymd)}
            className={`border-r border-slate-800 px-2 py-2 ${
              onPickDay ? "cursor-pointer hover:bg-slate-800/60" : "cursor-default"
            } ${d.isToday ? "bg-blue-950/40 text-blue-100" : "text-slate-300"}`}
          >
            <div className="text-[10px] uppercase tracking-wide text-slate-500">{d.label}</div>
            <div className="text-base font-medium">{d.dayNum}</div>
          </button>
        ))}
      </div>

      <div
        className="grid border-b border-slate-800"
        style={{ gridTemplateColumns: `64px repeat(${dayYmds.length}, minmax(0, 1fr))` }}
      >
        <div className="border-r border-slate-800 bg-slate-950/40 px-2 py-1 text-[10px] text-slate-500">
          all-day
        </div>
        {dayYmds.map((ymd) => {
          const all = partition.allDay.get(ymd) ?? [];
          return (
            <div
              key={ymd}
              onClick={onCreateAllDay ? () => onCreateAllDay(ymd) : undefined}
              title={onCreateAllDay ? "Click to add an all-day event" : undefined}
              className={`min-h-[36px] border-r border-slate-800 p-1 ${
                onCreateAllDay ? "cursor-pointer transition-colors hover:bg-slate-900/40" : ""
              }`}
            >
              <div className="flex flex-col gap-0.5">
                {all.map((ev) => (
                  <button
                    key={`${ev.id}@${ev.instanceStartUtc}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPickEvent(ev);
                    }}
                    className={`truncate rounded px-2 py-0.5 text-left text-[11px] font-medium ${
                      isGreyedOccurrence(ev)
                        ? "bg-slate-800/60 text-slate-500 line-through hover:bg-slate-800"
                        : "bg-amber-900/60 text-amber-100 hover:bg-amber-800/70"
                    }`}
                    title={ev.title}
                  >
                    {ev.title}
                    {ev.isRecurringInstance && !isGreyedOccurrence(ev) && <span className="ml-1 text-amber-300">↻</span>}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="relative grid"
        style={{
          gridTemplateColumns: `64px repeat(${dayYmds.length}, minmax(0, 1fr))`,
          height: `${(HOUR_END - HOUR_START + 1) * HOUR_HEIGHT_PX}px`,
        }}
      >
        <div className="border-r border-slate-800">
          {hours.map((h) => (
            <div
              key={h}
              className="flex items-start justify-end border-b border-slate-800/60 px-2 pt-1 text-[10px] text-slate-500"
              style={{ height: `${HOUR_HEIGHT_PX}px` }}
            >
              {formatHourLabel(h)}
            </div>
          ))}
        </div>

        {dayYmds.map((ymd) => {
          const timed = partition.timed.get(ymd) ?? [];
          const isToday = ymd === todayYmd;
          return (
            <div
              key={ymd}
              onClick={
                onCreateSlot
                  ? (e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const minutes = ((e.clientY - rect.top) / HOUR_HEIGHT_PX) * 60;
                      const snapped = Math.max(0, Math.floor(minutes / 30) * 30);
                      onCreateSlot(ymd, HOUR_START * 60 + snapped);
                    }
                  : undefined
              }
              title={onCreateSlot ? "Click to add an event at this time" : undefined}
              className={`relative border-r border-slate-800 ${
                onCreateSlot ? "cursor-pointer transition-colors hover:bg-slate-900/30" : ""
              }`}
            >
              {hours.map((h) => (
                <div
                  key={h}
                  className="pointer-events-none border-b border-slate-800/60"
                  style={{ height: `${HOUR_HEIGHT_PX}px` }}
                />
              ))}
              {isToday && nowLineMin >= 0 && nowLineMin <= (HOUR_END - HOUR_START + 1) * 60 && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                  style={{ top: `${(nowLineMin / 60) * HOUR_HEIGHT_PX}px` }}
                >
                  <span className="-ml-1 h-2 w-2 shrink-0 rounded-full bg-cyan-400 shadow-[0_0_8px] shadow-cyan-400/80" />
                  <span className="h-px flex-1 bg-cyan-400/70" />
                </div>
              )}
              {timed.map((ev) => {
                const startIso = rangeInstanceStartUtc(ev);
                const endIso = rangeInstanceEndUtc(ev);
                const startMin = Math.max(0, wallMinutesInZone(startIso, displayZone) - HOUR_START * 60);
                const endMinRaw = endIso
                  ? wallMinutesInZone(endIso, displayZone)
                  : wallMinutesInZone(startIso, displayZone) + 60;
                const endMin = Math.min((HOUR_END - HOUR_START + 1) * 60, endMinRaw - HOUR_START * 60);
                const top = (startMin / 60) * HOUR_HEIGHT_PX;
                const height = Math.max(20, ((endMin - startMin) / 60) * HOUR_HEIGHT_PX - 2);
                if (endMin <= 0 || startMin >= (HOUR_END - HOUR_START + 1) * 60) return null;
                return (
                  <button
                    key={`${ev.id}@${ev.instanceStartUtc}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPickEvent(ev);
                    }}
                    className={`absolute left-1 right-1 overflow-hidden rounded px-2 py-1 text-left text-xs shadow-sm ${
                      isGreyedOccurrence(ev)
                        ? "bg-slate-700/60 text-slate-400 line-through hover:bg-slate-700/80"
                        : "bg-blue-700/70 text-white hover:bg-blue-600/80"
                    }`}
                    style={{ top: `${top}px`, height: `${height}px` }}
                    title={ev.title}
                  >
                    <div className="truncate font-medium">
                      {ev.title}
                      {ev.isRecurringInstance && <span className="ml-1 text-blue-200">↻</span>}
                    </div>
                    <div className="truncate text-[10px] text-blue-100">
                      {formatTimeInZone(rangeInstanceStartUtc(ev), displayZone)}
                      {rangeInstanceEndUtc(ev)
                        ? ` – ${formatTimeInZone(rangeInstanceEndUtc(ev)!, displayZone)}`
                        : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type Partition = {
  allDay: Map<string, CalendarRangeItem[]>;
  timed: Map<string, CalendarRangeItem[]>;
};

function splitAllDayAndTimed(
  events: CalendarRangeItem[],
  dayYmds: string[],
  displayZone: string
): Partition {
  const all = new Map<string, CalendarRangeItem[]>();
  const timed = new Map<string, CalendarRangeItem[]>();
  for (const y of dayYmds) {
    all.set(y, []);
    timed.set(y, []);
  }
  for (const ev of events) {
    const y = ymdInZone(rangeInstanceStartUtc(ev), displayZone);
    if (!dayYmds.includes(y)) continue;
    const target = ev.allDay ? all.get(y) : timed.get(y);
    if (target) target.push(ev);
  }
  return { allDay: all, timed };
}

function formatHourLabel(h: number): string {
  const ampm = h >= 12 ? "PM" : "AM";
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return `${hh} ${ampm}`;
}
