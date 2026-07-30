import { useCallback, useEffect, useState } from "react";
import {
  getBudgetMonthNote,
  postBudgetEnvelopesRoll,
  putBudgetMonthNote,
  type BudgetEnvelope,
} from "../../api";
import { formatMoney, formatMonthLong } from "../../lib/budgetMoney";
import { titleCase } from "../../lib/titleCase";

function nextMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type Props = {
  token: string;
  actor: string;
  month: string;
  envelopes: BudgetEnvelope[];
  onSaved: () => Promise<void>;
  onGoNextMonth?: () => void;
};

export default function BudgetMonthClose({ token, actor, month, envelopes, onSaved, onGoNextMonth }: Props) {
  const leftovers = envelopes.filter((e) => e.remaining > 0 && e.targetAmount > 0);
  const [note, setNote] = useState("");
  const [closedAt, setClosedAt] = useState<string | null>(null);
  const [rollMode, setRollMode] = useState<"targets" | "remaining">("remaining");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const loadNote = useCallback(async () => {
    try {
      const n = await getBudgetMonthNote(token, month);
      setNote(n.note ?? "");
      setClosedAt(n.closedAt ?? null);
    } catch {
      setNote("");
      setClosedAt(null);
    }
  }, [token, month]);

  useEffect(() => {
    void loadNote();
  }, [loadNote]);

  async function saveNote(markClosed: boolean) {
    if (!actor) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await putBudgetMonthNote(token, actor, { month, note, markClosed });
      setStatus(markClosed ? `${formatMonthLong(month)} marked closed.` : "Note saved.");
      await loadNote();
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function rollEnvelopes() {
    if (!actor) return;
    const toMonth = nextMonth(month);
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await postBudgetEnvelopesRoll(token, actor, {
        fromMonth: month,
        toMonth,
        mode: rollMode,
      });
      setStatus(`Rolled ${res.count} envelope${res.count === 1 ? "" : "s"} into ${formatMonthLong(toMonth)}.`);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="hb-card p-4">
      <h2 className="mb-1 text-lg font-medium text-white">Close {formatMonthLong(month)}</h2>
      <p className="mb-4 text-xs text-slate-500">Wrap up the month, roll leftovers, and leave a note for your household.</p>

      {leftovers.length > 0 && (
        <div className="mb-4 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Leftover envelopes</h3>
          <ul className="mb-3 space-y-1 text-sm text-slate-300">
            {leftovers.map((e) => (
              <li key={e.categoryId} className="flex justify-between gap-2">
                <span>{titleCase(e.categoryName)}</span>
                <span className="text-emerald-300">${formatMoney(e.remaining)} left</span>
              </li>
            ))}
          </ul>
          {actor && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={rollMode}
                onChange={(e) => setRollMode(e.target.value as "targets" | "remaining")}
                className="hb-input px-2 py-1 text-xs text-slate-100"
              >
                <option value="remaining">Roll remaining amounts</option>
                <option value="targets">Roll target amounts</option>
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={() => void rollEnvelopes()}
                className="rounded-lg border border-blue-700/60 bg-blue-950/40 px-3 py-1 text-xs text-blue-100 hover:bg-blue-950/70 disabled:opacity-50"
              >
                Roll to {formatMonthLong(nextMonth(month))}
              </button>
            </div>
          )}
        </div>
      )}

      <label className="mb-3 block text-xs text-slate-400">
        Month note
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="What went well? Anything to remember for next month?"
          className="mt-1 w-full hb-input px-3 py-2 text-sm text-slate-100"
        />
      </label>

      {closedAt && (
        <p className="mb-2 text-xs text-emerald-400">Closed {new Date(closedAt).toLocaleString()}</p>
      )}

      {actor ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveNote(false)}
            className="rounded-lg hb-btn-soft px-3 py-1.5 text-xs text-slate-200 disabled:opacity-50"
          >
            Save note
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveNote(true)}
            className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            Close month
          </button>
          {onGoNextMonth && (
            <button
              type="button"
              onClick={onGoNextMonth}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Go to next month →
            </button>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-500">Set “Acting as” in Settings to save notes.</p>
      )}

      {status && <p className="mt-2 text-xs text-emerald-300">{status}</p>}
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </section>
  );
}
