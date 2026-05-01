import { useMemo } from "react";
import type { CalendarRangeItem } from "../api";
import {
  SHORT_WEEKDAYS,
  addDays,
  formatLocalTime,
  isSameMonth,
  parseUtcIso,
  sameDay,
  startOfMonthGrid,
} from "./dateUtils";

type Props = {
  anchor: Date;
  events: CalendarRangeItem[];
  onPickDay: (day: Date) => void;
  onPickEvent: (event: CalendarRangeItem) => void;
};

const MAX_PER_CELL = 3;

export default function MonthView({ anchor, events, onPickDay, onPickEvent }: Props) {
  const grid = useMemo(() => buildGrid(anchor, events), [anchor, events]);
  const today = new Date();

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-900/60 text-center text-xs font-medium uppercase tracking-wide text-slate-400">
        {SHORT_WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {grid.map((cell) => {
          const inMonth = isSameMonth(cell.day, anchor);
          const isToday = sameDay(cell.day, today);
          return (
            <button
              type="button"
              key={cell.day.toISOString()}
              onClick={() => onPickDay(cell.day)}
              className={`flex min-h-[110px] flex-col items-stretch gap-1 border-b border-r border-slate-800 p-1.5 text-left transition-colors hover:bg-slate-900/70 ${
                inMonth ? "bg-slate-950/40" : "bg-slate-950/10 text-slate-500"
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isToday
                      ? "bg-blue-600 text-white"
                      : inMonth
                        ? "text-slate-200"
                        : "text-slate-500"
                  }`}
                >
                  {cell.day.getDate()}
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
                    className="truncate rounded bg-blue-900/60 px-1.5 py-0.5 text-[11px] font-medium text-blue-100 hover:bg-blue-800/70"
                    title={`${ev.title}${ev.allDay ? "" : ` · ${formatLocalTime(parseUtcIso(ev.instanceStartUtc))}`}`}
                  >
                    {!ev.allDay && (
                      <span className="mr-1 text-[10px] text-blue-300">
                        {formatLocalTime(parseUtcIso(ev.instanceStartUtc))}
                      </span>
                    )}
                    {ev.title}
                    {ev.isRecurringInstance && <span className="ml-1 text-blue-300">↻</span>}
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

type Cell = { day: Date; events: CalendarRangeItem[] };

function buildGrid(anchor: Date, events: CalendarRangeItem[]): Cell[] {
  const start = startOfMonthGrid(anchor);
  const cells: Cell[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push({ day: addDays(start, i), events: [] });
  }
  for (const ev of events) {
    const d = parseUtcIso(ev.instanceStartUtc);
    const idx = cells.findIndex((c) => sameDay(c.day, d));
    if (idx >= 0) cells[idx].events.push(ev);
  }
  return cells;
}
