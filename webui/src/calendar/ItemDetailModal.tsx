import { useEffect, useState } from "react";
import {
  deleteCalendarItem,
  getCalendarItemDetail,
  patchCalendarItem,
  postCalendarItemComplete,
  type CalendarItemDetail,
} from "../api";

type Props = {
  open: boolean;
  itemId: number | null;
  /** When opened from a recurring instance, show a banner that Complete/Delete affect the whole series. */
  isRecurringInstance?: boolean;
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
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<"save" | "complete" | "delete" | null>(null);

  useEffect(() => {
    if (!open || itemId == null) return;
    setDetail(null);
    setTitle(initialTitle ?? "");
    setStart("");
    setEnd("");
    setDescription("");
    setNotes("");
    setLink("");
    setLoading(true);
    let cancelled = false;
    getCalendarItemDetail(token, itemId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setTitle(d.title);
        setStart(d.start);
        setDescription(d.description);
        setNotes(d.notes);
        setLink(d.link);
      })
      .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, itemId, token, initialTitle, onError]);

  if (!open || itemId == null) return null;

  const canActor = /^\d+$/.test(actorUserId.trim()) && actorUserId.trim() !== "0";

  async function handleSave() {
    setBusy("save");
    try {
      await patchCalendarItem(token, itemId!, {
        title: title.trim() || undefined,
        start: start.trim() || undefined,
        end: end.trim() || undefined,
        description: description.trim() || undefined,
        notes: notes.trim() || undefined,
        link: link.trim() || undefined,
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

  async function handleComplete() {
    if (!canActor) {
      onError("Set actorUserId in Settings to complete items.");
      return;
    }
    setBusy("complete");
    try {
      await postCalendarItemComplete(token, actorUserId.trim(), itemId!);
      onSuccess(isRecurringInstance ? "Series marked complete." : "Marked complete.");
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
    if (!window.confirm(isRecurringInstance ? "Delete the entire recurring series?" : "Delete this item?")) {
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="my-10 w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="detail-modal-heading" className="text-lg font-semibold text-white">
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
            This is a recurring event. <strong>Complete</strong> and <strong>Delete</strong> affect the entire series.
            Per-instance edits are not supported yet.
          </p>
        )}

        {loading && <p className="text-sm text-slate-400">Loading…</p>}

        {detail !== null && (
          <div className="space-y-4">
            <Field label="Title">
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start (UTC text or natural language)">
                <input
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className={inputClass}
                  placeholder="empty = task"
                />
              </Field>
              <Field label="End (optional)">
                <input
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className={inputClass}
                  placeholder="leave blank to keep current"
                />
              </Field>
            </div>
            <Field label="Description">
              <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Notes">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} />
            </Field>
            <Field label="Link">
              <input value={link} onChange={(e) => setLink(e.target.value)} className={inputClass} />
            </Field>

            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-400">
              <p>
                <strong>Read-only here (server v1 patch):</strong> all-day, reminder, recurrence, assignee. Delete and
                re-add the item to change those.
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                <dt>All-day</dt>
                <dd className="text-slate-200">{detail.allDay ? "yes" : "no"}</dd>
                <dt>Reminder</dt>
                <dd className="text-slate-200">{detail.reminder || "—"}</dd>
              </dl>
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!canActor || busy !== null}
                  onClick={() => void handleComplete()}
                  className="rounded-lg border border-emerald-700 bg-emerald-900/40 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-900/60 disabled:opacity-50"
                >
                  {busy === "complete" ? "…" : "Complete"}
                </button>
                <button
                  type="button"
                  disabled={!canActor || busy !== null}
                  onClick={() => void handleDelete()}
                  className="rounded-lg border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-100 hover:bg-red-950/70 disabled:opacity-50"
                >
                  {busy === "delete" ? "…" : "Delete"}
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
  "w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      {children}
    </label>
  );
}
