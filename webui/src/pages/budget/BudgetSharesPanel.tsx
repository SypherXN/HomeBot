import { useState } from "react";
import { patchBudgetShareStatus, type BudgetSharesOverview } from "../../api";
import { formatMoney } from "../../lib/budgetMoney";

type Props = {
  overview: BudgetSharesOverview;
  token: string;
  actor: string;
  onChanged: () => Promise<void> | void;
};

function chargeTitle(merchant: string | null, date: string | null): string {
  const day = date?.slice(0, 10);
  return [merchant?.trim() || "Expense", day].filter(Boolean).join(" · ");
}

/** Open reimbursements still owed to you, plus ignored charges you can restore. */
export default function BudgetSharesPanel({ overview, token, actor, onChanged }: Props) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasOpen = overview.open.length > 0;
  const hasIgnored = overview.ignored.length > 0;
  if (!hasOpen && !hasIgnored) return null;

  async function setStatus(id: number, status: "open" | "ignored") {
    if (!actor) return;
    setBusyId(id);
    setError(null);
    try {
      await patchBudgetShareStatus(token, actor, id, status);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section id="budget-shares-panel" className="hb-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium text-white">Waiting to be paid back</h2>
        {hasOpen && (
          <p className="text-sm text-amber-200">
            ${formatMoney(overview.outstandingTotal)}
            {overview.outstandingPeopleCount > 0
              ? ` from ${overview.outstandingPeopleCount} ${overview.outstandingPeopleCount === 1 ? "person" : "people"}`
              : ""}
          </p>
        )}
      </div>
      {error && <p className="mb-2 text-sm text-rose-300">{error}</p>}
      {hasOpen ? (
        <ul className="space-y-2">
          {overview.open.map((c) => (
            <li
              key={c.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-200">
                  {c.owedByLabel} · ${formatMoney(c.remaining)}
                </p>
                <p className="truncate text-[11px] text-slate-500">{chargeTitle(c.merchant, c.expenseDate)}</p>
                {c.paidAmount > 0.005 && (
                  <p className="text-[11px] text-slate-600">
                    ${formatMoney(c.paidAmount)} of ${formatMoney(c.amount)} received
                  </p>
                )}
              </div>
              {actor ? (
                <button
                  type="button"
                  disabled={busyId === c.id}
                  onClick={() => void setStatus(c.id, "ignored")}
                  className="shrink-0 text-xs text-slate-400 hover:text-white disabled:opacity-50"
                >
                  {busyId === c.id ? "…" : "Ignore"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">You&apos;re not waiting on anyone right now.</p>
      )}
      {hasIgnored && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Not collecting</h3>
          <ul className="space-y-2">
            {overview.ignored.map((c) => (
              <li
                key={c.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-400">
                    {c.owedByLabel} · ${formatMoney(Math.max(0, c.amount - c.paidAmount))}
                  </p>
                  <p className="truncate text-[11px] text-slate-600">{chargeTitle(c.merchant, c.expenseDate)}</p>
                </div>
                {actor ? (
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => void setStatus(c.id, "open")}
                    className="shrink-0 text-xs text-slate-400 hover:text-white disabled:opacity-50"
                  >
                    {busyId === c.id ? "…" : "Restore"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
