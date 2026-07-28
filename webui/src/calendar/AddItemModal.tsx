import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import DiscordMemberSelect from "../components/DiscordMemberSelect";
import Sheet from "../components/Sheet";
import CalendarReminderSelect from "./CalendarReminderSelect";
import RecurrenceEditor from "./RecurrenceEditor";
import { formatRecurrence as recurrenceToString } from "../lib/recurrenceEditor";
import type { RecurrenceEditorState } from "../lib/recurrenceEditor";
import { emptyRecurrence } from "../lib/recurrenceEditor";
import type { DiscordGuildRosterState } from "../hooks/useDiscordGuildRoster";
import { postCalendarItem } from "../api";
import { defaultStartTimeForDate } from "../lib/calendarDefaults";
import { CALENDAR_TIME_ZONE_OPTIONS } from "./timeZoneOptions";

type Mode = "event" | "task";

type Props = {
  open: boolean;
  initialMode: Mode;
  /** Calendar day (`YYYY-MM-DD`) in the viewer zone to pre-fill the event start. */
  initialYmd?: string | null;
  /** Pre-fill start wall time `HH:mm` (e.g. a clicked time slot). */
  initialStartTime?: string | null;
  /** Pre-fill end wall time `HH:mm` (paired with initialStartTime). */
  initialEndTime?: string | null;
  /** Pre-check all-day (e.g. clicked the all-day row). */
  initialAllDay?: boolean;
  /** Pre-fill the title (e.g. from the natural-language quick-create field). */
  initialTitle?: string | null;
  /** Default IANA id for new events (usually matches viewer zone). */
  eventTimeZoneDefault: string;
  token: string;
  guildRoster: DiscordGuildRosterState;
  onClose: () => void;
  onCreated: (mode: Mode) => void;
  onError: (message: string) => void;
};

export default function AddItemModal({
  open,
  initialMode,
  initialYmd,
  initialStartTime,
  initialEndTime,
  initialAllDay,
  initialTitle,
  eventTimeZoneDefault,
  token,
  guildRoster,
  onClose,
  onCreated,
  onError,
}: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [eventTz, setEventTz] = useState(eventTimeZoneDefault);
  const [allDay, setAllDay] = useState(false);
  const [reminder, setReminder] = useState("");
  const [recurrence, setRecurrence] = useState<RecurrenceEditorState>(emptyRecurrence());
  const [dueDate, setDueDate] = useState("");
  const [assignToEveryone, setAssignToEveryone] = useState(false);
  const [assignedTo, setAssignedTo] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [link, setLink] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setTitle(initialTitle?.trim() ?? "");
    const tz = eventTimeZoneDefault;
    setEventTz(tz);
    const y =
      initialYmd && /^\d{4}-\d{2}-\d{2}$/.test(initialYmd)
        ? initialYmd
        : DateTime.now().setZone(tz).toISODate()!;
    setStartDate(y);
    setDueDate(initialMode === "task" ? y : "");
    const st =
      initialStartTime && /^\d{2}:\d{2}$/.test(initialStartTime)
        ? initialStartTime
        : defaultStartTimeForDate(y, tz);
    setStartTime(st);
    if (initialEndTime && /^\d{2}:\d{2}$/.test(initialEndTime)) {
      setEndDate(y);
      setEndTime(initialEndTime);
    } else {
      setEndDate("");
      setEndTime("");
    }
    setAllDay(initialAllDay === true && initialMode === "event");
    setReminder("");
    setRecurrence(emptyRecurrence());
    setAssignToEveryone(false);
    setAssignedTo("");
    setDescription("");
    setNotes("");
    setLink("");
    setSubmitting(false);
  }, [open, initialMode, initialYmd, initialStartTime, initialEndTime, initialAllDay, initialTitle, eventTimeZoneDefault]);

  if (!open) return null;

  function wallStartForApi(): string {
    if (allDay) return `${startDate}T00:00:00`;
    const t = normalizeHm(startTime);
    return `${startDate}T${t}`;
  }

  function wallEndForApi(): string | undefined {
    if (!endDate.trim()) return undefined;
    const t = endTime.trim() ? normalizeHm(endTime) : "00:00:00";
    return `${endDate.trim()}T${t}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) {
      onError("Title is required.");
      return;
    }
    if (mode === "event") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate.trim())) {
        onError("Start date must be YYYY-MM-DD.");
        return;
      }
    } else if (dueDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate.trim())) {
      onError("Due date must be YYYY-MM-DD.");
      return;
    }
    const recurrenceString = recurrenceToString(recurrence);
    setSubmitting(true);
    try {
      const isTask = mode === "task";
      const hasDue = isTask && /^\d{4}-\d{2}-\d{2}$/.test(dueDate.trim());
      await postCalendarItem(token, {
        title: t,
        start: isTask ? (hasDue ? `${dueDate.trim()}T00:00:00` : "") : wallStartForApi(),
        end: isTask ? undefined : wallEndForApi(),
        allDay: isTask ? hasDue : allDay,
        reminder: reminder.trim() || undefined,
        recurrence: recurrenceString || undefined,
        assignToEveryone: !isTask && assignToEveryone,
        assignedToUserId: assignedTo.trim() || undefined,
        description: description.trim() || undefined,
        notes: notes.trim() || undefined,
        link: link.trim() || undefined,
        timezone: isTask ? (hasDue ? eventTz.trim() : undefined) : eventTz.trim(),
      });
      onCreated(mode);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      title={mode === "event" ? "New event" : "New task"}
      onClose={onClose}
      panelClassName="md:max-w-2xl"
    >
      <div className="mb-4 flex w-full max-w-full flex-wrap rounded-lg border border-slate-700 bg-slate-900/60 p-1 text-sm sm:inline-flex sm:w-auto">
        <button
          type="button"
          onClick={() => setMode("event")}
          className={`min-h-[2.5rem] flex-1 rounded-md px-3 py-1.5 sm:flex-none ${mode === "event" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"}`}
        >
          Event
        </button>
        <button
          type="button"
          onClick={() => setMode("task")}
          className={`min-h-[2.5rem] flex-1 rounded-md px-3 py-1.5 sm:flex-none ${mode === "task" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"}`}
        >
          Task
        </button>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <Field label="Title" required>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            className={inputClass}
            placeholder={mode === "event" ? "Dentist appointment" : "Take out trash"}
          />
        </Field>

        {mode === "event" && (
          <>
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Start date">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Start time">
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={allDay}
                  className={`${inputClass} disabled:opacity-50`}
                />
              </Field>
              <Field label="End date (optional)">
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
              </Field>
              <Field label="End time (optional)">
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  disabled={allDay}
                  className={`${inputClass} disabled:opacity-50`}
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900"
              />
              All-day event (uses start date at midnight in the event timezone)
            </label>
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Reminder">
                <CalendarReminderSelect value={reminder} onChange={setReminder} className={inputClass} />
              </Field>
            </div>
            <RecurrenceEditor value={recurrence} onChange={setRecurrence} inputClass={inputClass} idPrefix="add-rec" />
          </>
        )}

        {mode === "task" && (
          <>
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Due date (optional)">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Reminder">
                <CalendarReminderSelect value={reminder} onChange={setReminder} className={inputClass} />
              </Field>
            </div>
            <RecurrenceEditor value={recurrence} onChange={setRecurrence} inputClass={inputClass} idPrefix="add-task-rec" />
            <Field label="Assigned user (Discord id)">
              <input
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                inputMode="numeric"
                className={inputClass}
                placeholder="leave blank for unassigned"
              />
              <div className="mt-2 min-w-0">
                <DiscordMemberSelect
                  token={token}
                  sharedRoster={guildRoster}
                  label="Pick from server"
                  value={assignedTo}
                  onPickUserId={setAssignedTo}
                  className="min-w-0"
                />
              </div>
            </Field>
          </>
        )}

        <details className="group rounded-lg border border-slate-800 bg-slate-900/30 px-3 py-2.5">
          <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 transition-colors hover:text-slate-200">
            More options
          </summary>
          <div className="mt-4 space-y-4">
            {mode === "event" && (
              <>
                <Field label="Event timezone (wall times above are in this zone)">
                  <select
                    value={eventTz}
                    onChange={(e) => setEventTz(e.target.value)}
                    className={inputClass}
                  >
                    {CALENDAR_TIME_ZONE_OPTIONS.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.label} ({z.id})
                      </option>
                    ))}
                  </select>
                </Field>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={assignToEveryone}
                    onChange={(e) => setAssignToEveryone(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                  />
                  Assign to everyone (overrides specific assignee)
                </label>
                <Field label="Assigned user (Discord id)">
                  <input
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    inputMode="numeric"
                    disabled={assignToEveryone}
                    className={`${inputClass} disabled:opacity-50`}
                    placeholder="leave blank for unassigned"
                  />
                  <div className="mt-2 min-w-0">
                    <DiscordMemberSelect
                      token={token}
                      sharedRoster={guildRoster}
                      label="Pick from server"
                      value={assignedTo}
                      onPickUserId={setAssignedTo}
                      disabled={assignToEveryone}
                      className="min-w-0"
                    />
                  </div>
                </Field>
              </>
            )}
            <Field label="Description">
              <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Notes">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className={inputClass}
              />
            </Field>
            <Field label="Link">
              <input value={link} onChange={(e) => setLink(e.target.value)} className={inputClass} />
            </Field>
          </div>
        </details>

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg border border-blue-500/60 bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-medium text-white hover:from-blue-500 hover:to-blue-600 disabled:opacity-50"
          >
            {submitting ? "Saving…" : `Add ${mode}`}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function normalizeHm(t: string): string {
  const s = t.trim();
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  return "09:00:00";
}

const inputClass =
  "box-border min-w-0 w-full max-w-full hb-input px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0 max-w-full">
      <span className="mb-1 block text-xs font-medium text-slate-400">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </span>
      {children}
    </label>
  );
}
