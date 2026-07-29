import { useMemo } from "react";
import type { CalendarRangeItem } from "../api";
import { SHORT_WEEKDAYS } from "./dateUtils";
import { formatTimeInZone, monthGridCells, rangeInstanceStartUtc, ymdInZone } from "./calendarZoned";
import { isGreyedOccurrence } from "./occurrenceStyle";
import { layerForAssignee } from "../lib/personLayers";

type Props = {
  anchorYmd: string;
  displayZone: string;
  events: CalendarRangeItem[];
  onPickDay: (ymd: string) => void;
  onPickEvent: (event: CalendarRangeItem) => void;
  /** Hover "+" affordance on a day cell — create an event for that date. */
  onCreateDay?: (ymd: string) => void;
  /** Person-layer colors keyed by assignee (empty → neutral layer). */
  colorByPerson?: boolean;
};

const MAX_PER_CELL = 3;

export default function MonthView({ anchorYmd, displayZone, events, onPickDay, onPickEvent, onCreateDay, colorByPerson }: Props) {
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
              className={`group flex min-h-[110px] flex-col items-stretch gap-1 border-b border-r border-slate-800 p-1.5 text-left transition-colors hover:bg-slate-900/70 ${
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
                <span className="flex items-center gap-1.5">
                  {onCreateDay && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Add event on ${cell.ymd}`}
                      title={`Add event on ${cell.ymd}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCreateDay(cell.ymd);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          onCreateDay(cell.ymd);
                        }
                      }}
                      className="hidden h-5 w-5 items-center justify-center rounded-md text-sm font-bold leading-none text-blue-300 opacity-0 transition-all hover:bg-blue-900/50 focus:opacity-100 group-hover:opacity-100 sm:inline-flex"
                    >
                      +
                    </span>
                  )}
                  {cell.events.length > MAX_PER_CELL && (
                    <span className="text-[10px] font-medium text-slate-400">
                      +{cell.events.length - MAX_PER_CELL}
                    </span>
                  )}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                {cell.events.slice(0, MAX_PER_CELL).map((ev) => {
                  const greyed = isGreyedOccurrence(ev);
                  const layer = colorByPerson ? layerForAssignee(ev.assignedTo) : undefined;
                  const chipClass = greyed
                    ? "bg-slate-800/60 text-slate-500 line-through hover:bg-slate-800"
                    : (layer?.chip ?? "bg-blue-900/60 text-blue-100 hover:bg-blue-800/70");
                  return (
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
                    className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${chipClass}`}
                    title={`${ev.title}${ev.allDay ? "" : ` · ${formatTimeInZone(rangeInstanceStartUtc(ev), displayZone)}`}${greyed ? " · completed" : ""}`}
                  >
                    {!ev.allDay && (
                      <span className={`mr-1 text-[10px] ${greyed ? "text-slate-500" : "text-blue-300"}`}>
                        {formatTimeInZone(rangeInstanceStartUtc(ev), displayZone)}
                      </span>
                    )}
                    {ev.title}
                    {ev.isRecurringInstance && !greyed && <span className="ml-1 text-blue-300">↻</span>}
                  </span>
                  );
                })}
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
