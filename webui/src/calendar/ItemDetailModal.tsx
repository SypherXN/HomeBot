import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import DiscordMemberSelect from "../components/DiscordMemberSelect";
import { useDiscordGuildRoster } from "../hooks/useDiscordGuildRoster";
import {
  deleteCalendarInstanceOverrides,
  deleteCalendarItem,
  getCalendarItemDetail,
  patchCalendarItem,
  patchCalendarRecurringInstance,
  postCalendarCompleteInstance,
  postCalendarItemComplete,
  postCalendarOmitInstance,
  type CalendarItemDetail,
} from "../api";
import { CALENDAR_TIME_ZONE_OPTIONS } from "./timeZoneOptions";

type Props = {
  open: boolean;
  itemId: number | null;
  /** When opened from a recurring instance, show options for this occurrence vs the whole series. */
  isRecurringInstance?: boolean;
  /** Canonical UTC slot from the range row (API key for per-instance actions). */
  instanceStartUtc?: string | null;
  /** Effective wall time for this occurrence (display override or canonical). */
  instanceWallClockUtc?: string | null;
  /** Optional pre-known fields used while detail loads (avoids empty modal flash). */
  initialTitle?: string;
  token: string;
  actorUserId: string;
  onClose: () => void;
  onChanged: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

export default function ItemDetailModal({
  open,
  itemId,
  isRecurringInstance,
  instanceStartUtc,
  instanceWallClockUtc,
  initialTitle,
  token,
  actorUserId,
  onClose,
  onChanged,
  onError,
  onSuccess,
}: Props) {
  const [detail, setDetail] = useState<CalendarItemDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [eventTz, setEventTz] = useState("UTC");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [link, setLink] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [reminder, setReminder] = useState("");
  const [seriesRecurrence, setSeriesRecurrence] = useState<"" | "daily" | "weekly" | "monthly">("");
  const [assignedTo, setAssignedTo] = useState("");
  const [busy, setBusy] = useState<"save" | "complete" | "completeOne" | "delete" | "omit" | "clear" | null>(null);
  const guildRoster = useDiscordGuildRoster(token);

  useEffect(() => {
    if (!open || itemId == null) return;
    setDetail(null);
    setTitle(initialTitle ?? "");
    setStartDate("");
    setStartTime("");
    setEndDate("");
    setEndTime("");
    setEventTz("UTC");
    setDescription("");
    setNotes("");
    setLink("");
    setLoading(true);
    let cancelled = false;
    const detailReq =
      isRecurringInstance && instanceStartUtc?.trim()
        ? getCalendarItemDetail(token, itemId, { instanceStartUtc: instanceStartUtc.trim() })
        : getCalendarItemDetail(token, itemId);
    detailReq
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setTitle(d.title);
        const tz = (d.timezone && d.timezone.trim()) || "UTC";
        setEventTz(tz);
        const anchorIso = (instanceWallClockUtc ?? instanceStartUtc)?.trim();
        if (isRecurringInstance && anchorIso) {
          const inst = utcIsoZToWallParts(anchorIso, tz);
          if (inst) {
            setStartDate(inst.date);
            setStartTime(inst.time);
          } else {
            const wall = d.start.trim() ? utcStorageToWallParts(d.start, tz) : null;
            if (wall) {
              setStartDate(wall.date);
              setStartTime(wall.time);
            } else {
              setStartDate("");
              setStartTime("09:00");
            }
          }
        } else {
          const wall = d.start.trim() ? utcStorageToWallParts(d.start, tz) : null;
          if (wall) {
            setStartDate(wall.date);
            setStartTime(wall.time);
          } else {
            setStartDate("");
            setStartTime("09:00");
          }
        }
        if (isRecurringInstance && d.end?.trim()) {
          const endWall = utcStorageToWallParts(d.end, tz);
          if (endWall) {
            setEndDate(endWall.date);
            setEndTime(endWall.time);
          } else {
            setEndDate("");
            setEndTime("");
          }
        } else if (!isRecurringInstance && d.end?.trim()) {
          const endWall = utcStorageToWallParts(d.end, tz);
          if (endWall) {
            setEndDate(endWall.date);
            setEndTime(endWall.time);
          } else {
            setEndDate("");
            setEndTime("");
          }
        } else {
          setEndDate("");
          setEndTime("");
        }
        setDescription(d.description);
        setNotes(d.notes);
        setLink(d.link);
        setAllDay(d.allDay);
        setReminder(d.reminder ?? "");
        const rec = (d.recurrence ?? "").trim();
        setSeriesRecurrence(
          rec === "daily" || rec === "weekly" || rec === "monthly" ? rec : ""
        );
        setAssignedTo(d.assignedTo ?? "");
      })
      .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, itemId, token, initialTitle, onError, isRecurringInstance, instanceStartUtc, instanceWallClockUtc]);

  if (!open || itemId == null) return null;

  const canActor = /^\d+$/.test(actorUserId.trim()) && actorUserId.trim() !== "0";

  async function handleSave() {
    if (isRecurringInstance && instanceStartUtc?.trim()) {
      if (!canActor) {
        onError("Set actorUserId in Settings to save per-instance changes.");
        return;
      }
      if (!detail?.start.trim()) {
        onError("This item has no scheduled start.");
        return;
      }
      if (!startDate.trim()) {
        onError("Start date is required.");
        return;
      }
      setBusy("save");
      try {
        let overrideIso: string;
        try {
          overrideIso = wallDateTimeToUtcIsoZ(startDate, startTime, eventTz);
        } catch {
          onError("Invalid start date or time.");
          return;
        }
        const patchBody: {
          instanceStartUtc: string;
          title?: string;
          description?: string;
          notes?: string;
          link?: string;
          overrideInstanceStartUtc: string;
          overrideInstanceEndUtc?: string;
        } = {
          instanceStartUtc: instanceStartUtc.trim(),
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          notes: notes.trim() || undefined,
          link: link.trim() || undefined,
          overrideInstanceStartUtc: overrideIso,
        };
        if (endDate.trim()) {
          try {
            patchBody.overrideInstanceEndUtc = wallDateTimeToUtcIsoZ(endDate, endTime, eventTz);
          } catch {
            onError("Invalid end date or time.");
            return;
          }
        }
        await patchCalendarRecurringInstance(token, actorUserId.trim(), itemId!, patchBody);
        onSuccess("Saved this occurrence.");
        onChanged();
        onClose();
      } catch (err) {
        onError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
      return;
    }

    setBusy("save");
    try {
      const startPayload =
        detail?.start?.trim() && startDate.trim()
          ? `${startDate.trim()}T${normalizeHmDetail(startTime)}`
          : undefined;
      let endPayload: string | undefined;
      let clearEnd = false;
      if (endDate.trim()) {
        endPayload = `${endDate.trim()}T${normalizeHmDetail(endTime)}`;
      } else if (detail?.end?.trim()) {
        clearEnd = true;
      }
      await patchCalendarItem(token, itemId!, {
        title: title.trim() || undefined,
        start: startPayload,
        end: endPayload,
        clearEnd,
        description: description.trim() || undefined,
        notes: notes.trim() || undefined,
        link: link.trim() || undefined,
        timezone: eventTz.trim() || undefined,
        allDay,
        reminder: reminder.trim(),
        recurrence: seriesRecurrence || "",
        ...(assignedTo.trim()
          ? { assignedToUserId: assignedTo.trim() }
          : { clearAssignedTo: true }),
      });
      onSuccess("Saved.");
      onChanged();
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const canPerInstanceActions =
    Boolean(isRecurringInstance && instanceStartUtc?.trim()) && canActor;

  async function handleOmitThisOccurrence() {
    if (!canActor || !instanceStartUtc?.trim()) {
      onError("Set actorUserId in Settings, or open this event from the calendar grid.");
      return;
    }
    if (!window.confirm("Hide only this occurrence? The rest of the series stays on the calendar. You can Undo.")) {
      return;
    }
    setBusy("omit");
    try {
      await postCalendarOmitInstance(token, actorUserId.trim(), itemId!, instanceStartUtc.trim());
      onSuccess("This occurrence was hidden.");
      onChanged();
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleClearInstanceOverrides() {
    if (!canActor || !instanceStartUtc?.trim()) {
      onError("Set actorUserId in Settings, or open this event from the calendar grid.");
      return;
    }
    if (
      !window.confirm(
        "Remove all overrides for this day (visibility, completion, title, times)? The series default returns. You can Undo."
      )
    ) {
      return;
    }
    setBusy("clear");
    try {
      await deleteCalendarInstanceOverrides(token, actorUserId.trim(), itemId!, instanceStartUtc.trim());
      onSuccess("This day's overrides were cleared.");
      onChanged();
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleCompleteThisOccurrence() {
    if (!canActor || !instanceStartUtc?.trim()) {
      onError("Set actorUserId in Settings, or open this event from the calendar grid.");
      return;
    }
    if (!window.confirm("Mark only this day complete? The series stays active. You can Undo.")) {
      return;
    }
    setBusy("completeOne");
    try {
      await postCalendarCompleteInstance(token, actorUserId.trim(), itemId!, instanceStartUtc.trim());
      onSuccess("This occurrence was marked complete.");
      onChanged();
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleComplete() {
    if (!canActor) {
      onError("Set actorUserId in Settings to complete items.");
      return;
    }
    setBusy("complete");
    try {
      await postCalendarItemComplete(token, actorUserId.trim(), itemId!);
      onSuccess(isRecurringInstance ? "Entire series marked complete." : "Marked complete.");
      onChanged();
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!canActor) {
      onError("Set actorUserId in Settings to delete items.");
      return;
    }
    if (!window.confirm(isRecurringInstance ? "Delete the entire recurring series (all dates)?" : "Delete this item?")) {
      return;
    }
    setBusy("delete");
    try {
      await deleteCalendarItem(token, actorUserId.trim(), itemId!);
      onSuccess(isRecurringInstance ? "Series deleted." : "Deleted.");
      onChanged();
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-modal-heading"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overflow-x-hidden bg-black/60 p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="my-4 w-[min(100%,42rem)] min-w-0 max-w-[calc(100vw-1.5rem)] overflow-x-hidden rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-2xl sm:my-10 sm:p-6"
      >
        <div className="mb-4 flex min-w-0 items-center justify-between gap-2">
          <h2 id="detail-modal-heading" className="min-w-0 flex-1 truncate text-lg font-semibold text-white">
            Item details
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {isRecurringInstance && (
          <p className="mb-4 rounded-lg border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
            Recurring event opened from the grid. <strong>Save changes</strong> applies to <em>this day only</em>{" "}
            (title, notes, link, start and optional end time). <strong>Hide</strong> removes this day from the
            calendar. <strong>Complete this day</strong> keeps it visible but struck through. <strong>Complete series</strong>{" "}
            / <strong>Delete series</strong> affect the whole series.
          </p>
        )}

        {loading && <p className="text-sm text-slate-400">Loading…</p>}

        {detail !== null && (
          <div className="space-y-4">
            <Field label="Title">
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
            </Field>
            {detail.start.trim() ? (
              <>
                <Field label="Event timezone">
                  <select value={eventTz} onChange={(e) => setEventTz(e.target.value)} className={inputClass}>
                    {!CALENDAR_TIME_ZONE_OPTIONS.some((o) => o.id === eventTz) && (
                      <option value={eventTz}>{eventTz}</option>
                    )}
                    {CALENDAR_TIME_ZONE_OPTIONS.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.label} ({z.id})
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Start date">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className={dateTimeInputClass}
                    />
                  </Field>
                  <Field label="Start time">
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className={dateTimeInputClass}
                    />
                  </Field>
                </div>
                {isRecurringInstance ? (
                  <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="End date (this day only, optional)">
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className={dateTimeInputClass}
                      />
                    </Field>
                    <Field label="End time">
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className={dateTimeInputClass}
                      />
                    </Field>
                  </div>
                ) : (
                  <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="End date (optional)">
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className={dateTimeInputClass}
                      />
                    </Field>
                    <Field label="End time">
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className={dateTimeInputClass}
                      />
                    </Field>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-500">This row has no scheduled start (task-style).</p>
            )}
            <Field label="Description">
              <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Notes">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} />
            </Field>
            <Field label="Link">
              <input value={link} onChange={(e) => setLink(e.target.value)} className={inputClass} />
            </Field>

            {!isRecurringInstance ? (
              <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <p className="text-xs text-slate-500">Series settings (applies to the whole event or task row)</p>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={allDay}
                    onChange={(e) => setAllDay(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                  />
                  All-day
                </label>
                <Field label="Reminder">
                  <input
                    value={reminder}
                    onChange={(e) => setReminder(e.target.value)}
                    placeholder="10m, 2h, 1d"
                    className={inputClass}
                  />
                </Field>
                <Field label="Recurrence">
                  <select
                    value={seriesRecurrence}
                    onChange={(e) =>
                      setSeriesRecurrence(e.target.value as "" | "daily" | "weekly" | "monthly")
                    }
                    className={inputClass}
                  >
                    <option value="">None</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </Field>
                <Field label="Assignee (Discord user id)">
                  <input
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    className={inputClass}
                  />
                  <div className="mt-2">
                    <DiscordMemberSelect
                      token={token}
                      sharedRoster={guildRoster}
                      label="Pick from server"
                      onPickUserId={setAssignedTo}
                    />
                  </div>
                </Field>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-400">
                <p>Series recurrence: {detail.recurrence || "none"} · all-day: {detail.allDay ? "yes" : "no"}</p>
                <p className="mt-1">Change recurrence or assignee on the series via a non-instance open, or edit this day only above.</p>
              </div>
            )}

            <div className="flex flex-col gap-2 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {canPerInstanceActions ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void handleOmitThisOccurrence()}
                    className="rounded-lg border border-sky-600 bg-sky-900/40 px-3 py-2 text-sm text-sky-100 hover:bg-sky-900/60 disabled:opacity-50"
                  >
                    {busy === "omit" ? "…" : "Hide this occurrence"}
                  </button>
                ) : null}
                {canPerInstanceActions ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void handleCompleteThisOccurrence()}
                    className="rounded-lg border border-emerald-600/80 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-950/60 disabled:opacity-50"
                  >
                    {busy === "completeOne" ? "…" : "Complete this day"}
                  </button>
                ) : null}
                {canPerInstanceActions ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void handleClearInstanceOverrides()}
                    className="rounded-lg border border-amber-600/80 bg-amber-950/40 px-3 py-2 text-sm text-amber-100 hover:bg-amber-950/60 disabled:opacity-50"
                  >
                    {busy === "clear" ? "…" : "Reset this day"}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={!canActor || busy !== null}
                  onClick={() => void handleComplete()}
                  className="rounded-lg border border-emerald-700 bg-emerald-900/40 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-900/60 disabled:opacity-50"
                >
                  {busy === "complete" ? "…" : isRecurringInstance ? "Complete series" : "Complete"}
                </button>
                <button
                  type="button"
                  disabled={!canActor || busy !== null}
                  onClick={() => void handleDelete()}
                  className="rounded-lg border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-100 hover:bg-red-950/70 disabled:opacity-50"
                >
                  {busy === "delete" ? "…" : isRecurringInstance ? "Delete series" : "Delete"}
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void handleSave()}
                  className="rounded-lg border border-blue-600 bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                >
                  {busy === "save" ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const inputClass =
  "box-border min-w-0 w-full max-w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

const dateTimeInputClass = `${inputClass} calendar-datetime-input`;

function utcStorageToWallParts(raw: string, zone: string): { date: string; time: string } | null {
  const dt = DateTime.fromFormat(raw.trim(), "yyyy-MM-dd HH:mm", { zone: "utc" }).setZone(zone);
  if (!dt.isValid) return null;
  return { date: dt.toFormat("yyyy-MM-dd"), time: dt.toFormat("HH:mm") };
}

function utcIsoZToWallParts(isoUtc: string, zone: string): { date: string; time: string } | null {
  const dt = DateTime.fromISO(isoUtc.trim(), { zone: "utc" }).setZone(zone);
  if (!dt.isValid) return null;
  return { date: dt.toFormat("yyyy-MM-dd"), time: dt.toFormat("HH:mm") };
}

function wallDateTimeToUtcIsoZ(date: string, timeHm: string, zone: string): string {
  const iso = `${date.trim()}T${normalizeHmDetail(timeHm)}`;
  const dt = DateTime.fromISO(iso, { zone: zone.trim() || "UTC" });
  if (!dt.isValid) throw new Error("invalid");
  return dt.toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'");
}

function normalizeHmDetail(t: string): string {
  const s = t.trim();
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  return "00:00:00";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0 max-w-full overflow-hidden">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      {children}
    </label>
  );
}
