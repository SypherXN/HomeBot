import { useEffect, useState } from "react";
import DiscordMemberSelect from "../components/DiscordMemberSelect";
import type { DiscordGuildRosterState } from "../hooks/useDiscordGuildRoster";
import { postCalendarItem } from "../api";
import { toDateTimeLocalInput } from "./dateUtils";

type Mode = "event" | "task";

type Props = {
  open: boolean;
  initialMode: Mode;
  /** Pre-fills `start` (event mode) at midnight of this day; ignored for task mode. */
  initialDate?: Date | null;
  token: string;
  guildRoster: DiscordGuildRosterState;
  onClose: () => void;
  onCreated: (mode: Mode) => void;
  onError: (message: string) => void;
};

export default function AddItemModal({
  open,
  initialMode,
  initialDate,
  token,
  guildRoster,
  onClose,
  onCreated,
  onError,
}: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
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
    setStart(initialMode === "event" && initialDate ? toDateTimeLocalInput(at9am(initialDate)) : "");
    setEnd("");
    setAllDay(false);
    setReminder("");
    setRecurrence("");
    setAssignToEveryone(false);
    setAssignedTo("");
    setDescription("");
    setNotes("");
    setLink("");
    setSubmitting(false);
  }, [open, initialMode, initialDate]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) {
      onError("Title is required.");
      return;
    }
    setSubmitting(true);
    try {
      await postCalendarItem(token, {
        title: t,
        start: mode === "event" ? start.trim() : "",
        end: end.trim() || undefined,
        allDay: mode === "event" ? allDay : false,
        reminder: reminder.trim() || undefined,
        recurrence: mode === "event" && recurrence ? recurrence : undefined,
        assignToEveryone: mode === "event" ? assignToEveryone : false,
        assignedToUserId: assignedTo.trim() || undefined,
        description: description.trim() || undefined,
        notes: notes.trim() || undefined,
        link: link.trim() || undefined,
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start">
                <input
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Empty = treat as task. Natural language also accepted (e.g. “tomorrow 6pm”).
                </p>
              </Field>
              <Field label="End">
                <input
                  type="datetime-local"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className={inputClass}
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
              All-day event
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

function at9am(d: Date): Date {
  const out = new Date(d);
  out.setHours(9, 0, 0, 0);
  return out;
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
