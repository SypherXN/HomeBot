import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import DiscordMemberSelect from "../components/DiscordMemberSelect";
import type { DiscordGuildRosterState } from "../hooks/useDiscordGuildRoster";
import { postCalendarItem } from "../api";
import { CALENDAR_TIME_ZONE_OPTIONS } from "./timeZoneOptions";

type Mode = "event" | "task";

type Props = {
  open: boolean;
  initialMode: Mode;
  /** Calendar day (`YYYY-MM-DD`) in the viewer zone to pre-fill the event start. */
  initialYmd?: string | null;
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
  const [recurrence, setRecurrence] = useState<"" | "daily" | "weekly">("");
  const [assignToEveryone, setAssignToEveryone] = useState(false);
  const [assignedTo, setAssignedTo] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [link, setLink] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setTitle("");
    const tz = eventTimeZoneDefault;
    setEventTz(tz);
    const y =
      initialMode === "event" && initialYmd && /^\d{4}-\d{2}-\d{2}$/.test(initialYmd)
        ? initialYmd
        : DateTime.now().setZone(tz).toISODate()!;
    setStartDate(y);
    setStartTime("09:00");
    setEndDate("");
    setEndTime("");
    setAllDay(false);
    setReminder("");
    setRecurrence("");
    setAssignToEveryone(false);
    setAssignedTo("");
    setDescription("");
    setNotes("");
    setLink("");
    setSubmitting(false);
  }, [open, initialMode, initialYmd, eventTimeZoneDefault]);

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
    }
    setSubmitting(true);
    try {
      await postCalendarItem(token, {
        title: t,
        start: mode === "event" ? wallStartForApi() : "",
        end: mode === "event" ? wallEndForApi() : undefined,
        allDay: mode === "event" ? allDay : false,
        reminder: reminder.trim() || undefined,
        recurrence: mode === "event" && recurrence ? recurrence : undefined,
        assignToEveryone: mode === "event" ? assignToEveryone : false,
        assignedToUserId: assignedTo.trim() || undefined,
        description: description.trim() || undefined,
        notes: notes.trim() || undefined,
        link: link.trim() || undefined,
        timezone: mode === "event" ? eventTz.trim() : undefined,
      });
      onCreated(mode);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title={mode === "event" ? "New event" : "New task"} onClose={onClose}>
      <div className="mb-4 inline-flex rounded-lg border border-slate-700 bg-slate-900/60 p-1 text-sm">
        <button
          type="button"
          onClick={() => setMode("event")}
          className={`rounded-md px-3 py-1.5 ${mode === "event" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"}`}
        >
          Event
        </button>
        <button
          type="button"
          onClick={() => setMode("task")}
          className={`rounded-md px-3 py-1.5 ${mode === "task" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"}`}
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
            <Field label="Event timezone (wall times below are in this zone)">
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
            <div className="grid gap-4 sm:grid-cols-2">
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
              <Field label="Reminder">
                <input
                  value={reminder}
                  onChange={(e) => setReminder(e.target.value)}
                  className={inputClass}
                  placeholder="10m, 2h, 1d"
                />
              </Field>
              <Field label="Recurrence">
                <select
                  value={recurrence}
                  onChange={(e) => setRecurrence(e.target.value as "" | "daily" | "weekly")}
                  className={inputClass}
                >
                  <option value="">none</option>
                  <option value="daily">daily</option>
                  <option value="weekly">weekly</option>
                </select>
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
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={assignToEveryone}
                onChange={(e) => setAssignToEveryone(e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900"
              />
              Assign to everyone (overrides specific assignee)
            </label>
          </>
        )}

        <Field label="Assigned user (Discord id)">
          <input
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            inputMode="numeric"
            disabled={mode === "event" && assignToEveryone}
            className={`${inputClass} disabled:opacity-50`}
            placeholder="leave blank for unassigned"
          />
          <div className="mt-2">
            <DiscordMemberSelect
              token={token}
              sharedRoster={guildRoster}
              label="Pick from server"
              onPickUserId={setAssignedTo}
              disabled={mode === "event" && assignToEveryone}
            />
          </div>
        </Field>

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
            className="rounded-lg border border-blue-600 bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {submitting ? "Saving…" : `Add ${mode}`}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function normalizeHm(t: string): string {
  const s = t.trim();
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  return "09:00:00";
}

const inputClass =
  "w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

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
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-400">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </span>
      {children}
    </label>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-heading"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="my-10 w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="modal-heading" className="text-lg font-semibold text-white">
            {title}
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
        {children}
      </div>
    </div>
  );
}
