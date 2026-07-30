import { useCallback, useEffect, useState } from "react";
import { getBudgetMonthNote, putBudgetMonthNote, type BudgetMonthNote } from "../../api";
import { formatMonthLong } from "../../lib/budgetMoney";

type Props = {
  token: string;
  actor: string;
  month: string;
  onSaved?: () => Promise<void>;
};

/** Household note for the month shown on Overview ("Vacation week — dining will be high"). */
export default function BudgetMonthNoteBanner({ token, actor, month, onSaved }: Props) {
  const [note, setNote] = useState<BudgetMonthNote | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setNote(await getBudgetMonthNote(token, month));
    } catch {
      setNote(null);
    }
  }, [token, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasNote = Boolean(note?.note?.trim());
  if (!hasNote && !actor) return null;

  async function save() {
    if (!actor) return;
    setBusy(true);
    try {
      await putBudgetMonthNote(token, actor, { month, note: draft });
      setEditing(false);
      await load();
      await onSaved?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="hb-card border-blue-800/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-400">
            {formatMonthLong(month)} note
          </p>
          {hasNote && !editing ? (
            <p className="mt-1 text-sm text-slate-200">{note!.note}</p>
          ) : (
            !editing && (
              <p className="mt-1 text-sm text-slate-500">
                Leave context for the household — “vacation week”, “annual insurance due”, etc.
              </p>
            )
          )}
          {note?.closedAt && !editing && (
            <p className="mt-1 text-xs text-slate-500">Month closed {new Date(note.closedAt).toLocaleDateString()}</p>
          )}
          {editing && (
            <div className="mt-2 space-y-2">
              <textarea
                autoFocus
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="e.g. Vacation week — expect higher dining."
                className="w-full hb-input px-3 py-2 text-sm text-slate-100"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save()}
                  className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Save note"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-lg hb-btn-soft px-3 py-1.5 text-sm text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        {actor && !editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(note?.note ?? "");
              setEditing(true);
            }}
            className="shrink-0 text-xs text-blue-400 hover:text-blue-300"
          >
            {hasNote ? "Edit note" : "Add note"}
          </button>
        )}
      </div>
    </section>
  );
}
