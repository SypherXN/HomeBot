import { useEffect, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import type { CalendarRangeItem } from "../api";
import { formatTimeInZone, rangeInstanceEndUtc, rangeInstanceStartUtc, wallMinutesInZone, ymdInZone } from "./calendarZoned";
import { isGreyedOccurrence } from "./occurrenceStyle";
import { layerForAssignee } from "../lib/personLayers";

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
  /** Person-layer colors keyed by assignee. */
  colorByPerson?: boolean;
  /** Drag/commit: event dropped at a new start (and possibly new end). Minutes since midnight. */
  onDragCommit?: (event: CalendarRangeItem, ymd: string, startMinutes: number, endMinutes: number | null) => void;
};

const HOUR_START = 6;
const HOUR_END = 23;
const HOUR_HEIGHT_PX = 44;
const NOW_TICK_MS = 60_000;
const SNAP_MIN = 15;
const MIN_DURATION_MIN = 15;

export default function TimeGridView({ dayYmds, displayZone, events, onPickEvent, onPickDay, onCreateSlot, onCreateAllDay, colorByPerson, onDragCommit }: Props) {
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

  // Drag state: which event is being moved/resized and its live preview geometry.
  const [drag, setDrag] = useState<{
    ev: CalendarRangeItem;
    kind: "move" | "resize";
    originYmd: string;
    durationMin: number;
    grabOffsetMin: number;
    startMin: number;
    endMin: number;
  } | null>(null);
  const dragRef = useRef(drag);
  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);
  const didDragRef = useRef(false);

  const dayLabels = dayYmds.map((ymd) => {
    const d = DateTime.fromISO(ymd, { zone: displayZone });
    return {
      ymd,
      label: d.toFormat("ccc"),
      dayNum: d.day,
      isToday: ymd === todayYmd,
    };
  });

  function minutesFromPointer(clientY: number, colEl: HTMLElement): number {
    const rect = colEl.getBoundingClientRect();
    const raw = ((clientY - rect.top) / HOUR_HEIGHT_PX) * 60;
    return Math.max(0, Math.min((HOUR_END - HOUR_START + 1) * 60, raw)) + HOUR_START * 60;
  }

  function beginDrag(e: React.PointerEvent, ev: CalendarRangeItem, kind: "move" | "resize", colEl: HTMLElement) {
    if (!onDragCommit || isGreyedOccurrence(ev) || ev.allDay) return;
    const startIso = rangeInstanceStartUtc(ev);
    const endIso = rangeInstanceEndUtc(ev);
    const startMin = wallMinutesInZone(startIso, displayZone);
    const endMin = endIso ? wallMinutesInZone(endIso, displayZone) : startMin + 60;
    const durationMin = Math.max(MIN_DURATION_MIN, endMin - startMin);
    const pointerMin = minutesFromPointer(e.clientY, colEl);
    setDrag({
      ev,
      kind,
      originYmd: ymdInZone(startIso, displayZone),
      durationMin,
      grabOffsetMin: pointerMin - startMin,
      startMin,
      endMin,
    });
    didDragRef.current = false;
  }

  function updateDrag(e: React.PointerEvent, colEl: HTMLElement) {
    const d = dragRef.current;
    if (!d) return;
    const pointerMin = minutesFromPointer(e.clientY, colEl);
    const gridMax = (HOUR_END + 1) * 60;
    if (d.kind === "move") {
      const rawStart = pointerMin - d.grabOffsetMin;
      const snapped = Math.round(rawStart / SNAP_MIN) * SNAP_MIN;
      const startMin = Math.max(0, Math.min(gridMax - d.durationMin, snapped));
      setDrag({ ...d, startMin, endMin: startMin + d.durationMin });
    } else {
      const snappedEnd = Math.round(pointerMin / SNAP_MIN) * SNAP_MIN;
      const endMin = Math.max(d.startMin + MIN_DURATION_MIN, Math.min(gridMax, snappedEnd));
      setDrag({ ...d, endMin });
    }
    didDragRef.current = true;
  }

  function endDrag(ymd: string) {
    const d = dragRef.current;
    if (!d) return;
    setDrag(null);
    if (didDragRef.current && onDragCommit) {
      onDragCommit(d.ev, ymd, Math.round(d.startMin), Math.round(d.endMin));
    }
    didDragRef.current = false;
  }

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
                {all.map((ev) => {
                  const greyed = isGreyedOccurrence(ev);
                  const layer = colorByPerson ? layerForAssignee(ev.assignedTo) : undefined;
                  const chipClass = greyed
                    ? "bg-slate-800/60 text-slate-500 line-through hover:bg-slate-800"
                    : (layer?.chip ?? "bg-amber-900/60 text-amber-100 hover:bg-amber-800/70");
                  return (
                  <button
                    key={`${ev.id}@${ev.instanceStartUtc}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPickEvent(ev);
                    }}
                    className={`truncate rounded px-2 py-0.5 text-left text-[11px] font-medium ${chipClass}`}
                    title={ev.title}
                  >
                    {ev.title}
                    {ev.isRecurringInstance && !greyed && <span className="ml-1 text-amber-300">↻</span>}
                  </button>
                  );
                })}
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
          const isDropTarget = drag !== null;
          return (
            <div
              key={ymd}
              data-day={ymd}
              onPointerMove={(e) => {
                if (dragRef.current) updateDrag(e, e.currentTarget);
              }}
              onPointerUp={() => {
                if (dragRef.current) endDrag(ymd);
              }}
              onPointerLeave={() => {
                // Moving across columns: keep drag alive; commit happens on pointerup in a column.
              }}
              onClick={
                onCreateSlot && !drag
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
                onCreateSlot && !drag ? "cursor-pointer transition-colors hover:bg-slate-900/30" : ""
              } ${isDropTarget ? "touch-none" : ""}`}
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
                const isDragging = drag?.ev === ev;
                const startMin = isDragging
                  ? drag.startMin
                  : wallMinutesInZone(startIso, displayZone);
                const endMin = isDragging
                  ? drag.endMin
                  : endIso
                    ? wallMinutesInZone(endIso, displayZone)
                    : wallMinutesInZone(startIso, displayZone) + 60;
                const relStart = startMin - HOUR_START * 60;
                const relEnd = Math.min((HOUR_END - HOUR_START + 1) * 60, endMin - HOUR_START * 60);
                const top = (relStart / 60) * HOUR_HEIGHT_PX;
                const height = Math.max(20, ((relEnd - relStart) / 60) * HOUR_HEIGHT_PX - 2);
                if (relEnd <= 0 || relStart >= (HOUR_END - HOUR_START + 1) * 60) return null;
                const greyed = isGreyedOccurrence(ev);
                const layer = colorByPerson ? layerForAssignee(ev.assignedTo) : undefined;
                const blockClass = greyed
                  ? "bg-slate-700/60 text-slate-400 line-through hover:bg-slate-700/80"
                  : (layer?.block ?? "bg-blue-700/70 text-white hover:bg-blue-600/80");
                const canDrag = Boolean(onDragCommit) && !greyed && !ev.allDay;
                return (
                  <div
                    key={`${ev.id}@${ev.instanceStartUtc}`}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!didDragRef.current) onPickEvent(ev);
                    }}
                    onPointerDown={(e) => {
                      if (!canDrag) return;
                      e.stopPropagation();
                      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                      beginDrag(e, ev, "move", e.currentTarget.parentElement as HTMLElement);
                    }}
                    className={`absolute left-1 right-1 overflow-hidden rounded px-2 py-1 text-left text-xs shadow-sm ${blockClass} ${
                      canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                    } ${isDragging ? "opacity-80 ring-2 ring-cyan-400/70 z-20" : ""}`}
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
                    {canDrag && height >= 28 && (
                      <div
                        role="separator"
                        aria-label={`Resize "${ev.title}"`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                          beginDrag(e, ev, "resize", (e.currentTarget.parentElement as HTMLElement).parentElement as HTMLElement);
                        }}
                        className="absolute inset-x-0 bottom-0 h-2.5 cursor-ns-resize touch-none rounded-b bg-black/20"
                      />
                    )}
                  </div>
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
