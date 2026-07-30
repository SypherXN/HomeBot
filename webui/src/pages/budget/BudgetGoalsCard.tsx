import { useState } from "react";
import { patchBudgetGoal, type BudgetGoal } from "../../api";
import { formatMoney } from "../../lib/budgetMoney";

type Props = {
  token: string;
  actor: string;
  goals: BudgetGoal[];
  /** Unassigned money this month (income plan minus envelopes), used for the contribute hint. */
  availableToBudget: number | null;
  onSaved: () => Promise<void>;
  onToast: (message: string) => void;
  onManageGoals: () => void;
};

/** Compact goals card for Overview: progress + quick contribute. */
export default function BudgetGoalsCard({ token, actor, goals, availableToBudget, onSaved, onToast, onManageGoals }: Props) {
  const [contributeId, setContributeId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = goals.filter((g) => g.percentComplete < 100);
  if (goals.length === 0) return null;

  async function contribute(g: BudgetGoal) {
    if (!actor) return;
    const add = Number(draft);
    if (!add || add <= 0) return;
    setBusy(true);
    setError(null);
    try {
      await patchBudgetGoal(token, actor, g.id, { currentAmount: g.currentAmount + add });
      onToast(`Added $${formatMoney(add)} to ${g.name}`);
      setContributeId(null);
      setDraft("");
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="hb-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium text-white">Goals</h2>
        <button type="button" onClick={onManageGoals} className="text-xs text-blue-400 hover:text-blue-300">
          Manage goals
        </button>
      </div>
      <ul className="space-y-3">
        {goals.map((g) => (
          <li key={g.id}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <span className={`text-sm ${g.percentComplete >= 100 ? "text-emerald-300" : "text-slate-200"}`}>
                {g.name}
                {g.percentComplete >= 100 ? " — funded" : ""}
              </span>
              <span className="text-xs text-slate-500">
                ${formatMoney(g.currentAmount)} / ${formatMoney(g.targetAmount)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full transition-all ${g.percentComplete >= 100 ? "bg-emerald-500" : "bg-gradient-to-r from-blue-600 to-blue-700"}`}
                  style={{ width: `${Math.min(100, g.percentComplete)}%` }}
                />
              </div>
              {actor && g.percentComplete < 100 && (
                contributeId === g.id ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <input
                      autoFocus
                      inputMode="decimal"
                      placeholder="$"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void contribute(g);
                        }
                        if (e.key === "Escape") setContributeId(null);
                      }}
                      className="w-20 hb-input px-2 py-0.5 text-xs text-slate-100"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void contribute(g)}
                      className="text-xs text-emerald-300 hover:text-emerald-200 disabled:opacity-50"
                    >
                      Add
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setContributeId(g.id);
                      setDraft(
                        availableToBudget != null && availableToBudget > 0
                          ? String(Math.min(availableToBudget, g.targetAmount - g.currentAmount).toFixed(2))
                          : ""
                      );
                    }}
                    className="shrink-0 text-xs text-blue-400 hover:text-blue-300"
                  >
                    Contribute
                  </button>
                )
              )}
            </div>
          </li>
        ))}
      </ul>
      {active.length > 0 && availableToBudget != null && availableToBudget > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          ${formatMoney(availableToBudget)} left to budget — Contribute prefills from this.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
    </section>
  );
}
