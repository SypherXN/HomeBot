import { useMemo } from "react";
import type { CalendarRangeItem } from "../api";
import { SHORT_WEEKDAYS } from "./dateUtils";
import { formatTimeInZone, monthGridCells, rangeInstanceStartUtc, ymdInZone } from "./calendarZoned";
import { isGreyedOccurrence } from "./occurrenceStyle";

type Props = {
  anchorYmd: string;
  displayZone: string;
  events: CalendarRangeItem[];
  onPickDay: (ymd: string) => void;
  onPickEvent: (event: CalendarRangeItem) => void;
};

const MAX_PER_CELL = 3;

export default function MonthView({ anchorYmd, displayZone, events, onPickDay, onPickEvent }: Props) {
  const grid = useMemo(() => buildGrid(anchorYmd, displayZone, events), [anchorYmd, displayZone, events]);
  const todayYmd = ymdInZone(new Date(), displayZone);

  return (
    <div className="overflow-hidden hb-card">
      <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-900/60 text-center text-xs font-medium uppercase tracking-wide text-slate-400">
        {SHORT_WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {grid.map((cell) => {
          const inMonth = cell.inMonth;
          const isToday = cell.ymd === todayYmd;
          return (
            <button
              type="button"
              key={cell.ymd}
              onClick={() => onPickDay(cell.ymd)}
              className={`flex min-h-[110px] flex-col items-stretch gap-1 border-b border-r border-slate-800 p-1.5 text-left transition-colors hover:bg-slate-900/70 ${
                inMonth ? "bg-slate-950/40" : "bg-slate-950/10 text-slate-500"
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isToday
                      ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white"
                      : inMonth
                        ? "text-slate-200"
                        : "text-slate-500"
                  }`}
                >
                  {cell.dayNum}
                </span>
                {cell.events.length > MAX_PER_CELL && (
                  <span className="text-[10px] font-medium text-slate-400">
                    +{cell.events.length - MAX_PER_CELL}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-0.5">
                {cell.events.slice(0, MAX_PER_CELL).map((ev) => (
                  <span
                    key={`${ev.id}@${ev.instanceStartUtc}`}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPickEvent(ev);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        onPickEvent(ev);
                      }
                    }}
                    className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${
                      isGreyedOccurrence(ev)
                        ? "bg-slate-800/60 text-slate-500 line-through hover:bg-slate-800"
                        : "bg-blue-900/60 text-blue-100 hover:bg-blue-800/70"
                    }`}
                    title={`${ev.title}${ev.allDay ? "" : ` · ${formatTimeInZone(rangeInstanceStartUtc(ev), displayZone)}`}${isGreyedOccurrence(ev) ? " · completed" : ""}`}
                  >
                    {!ev.allDay && (
                      <span className={`mr-1 text-[10px] ${isGreyedOccurrence(ev) ? "text-slate-500" : "text-blue-300"}`}>
                        {formatTimeInZone(rangeInstanceStartUtc(ev), displayZone)}
                      </span>
                    )}
                    {ev.title}
                    {ev.isRecurringInstance && !isGreyedOccurrence(ev) && <span className="ml-1 text-blue-300">↻</span>}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Cell = { ymd: string; dayNum: number; inMonth: boolean; events: CalendarRangeItem[] };

function buildGrid(anchorYmd: string, displayZone: string, events: CalendarRangeItem[]): Cell[] {
  const cells = monthGridCells(anchorYmd, displayZone).map((c) => ({
    ...c,
    events: [] as CalendarRangeItem[],
  }));
  for (const ev of events) {
    const y = ymdInZone(rangeInstanceStartUtc(ev), displayZone);
    const idx = cells.findIndex((c) => c.ymd === y);
    if (idx >= 0) cells[idx].events.push(ev);
  }
  return cells;
}
