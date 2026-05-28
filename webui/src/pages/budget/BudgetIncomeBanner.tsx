import { useState } from "react";
import { putBudgetIncomePlan, type BudgetIncomePlan } from "../../api";

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  token: string;
  actor: string;
  month: string;
  plan: BudgetIncomePlan | null;
  onSaved: () => Promise<void>;
};

export default function BudgetIncomeBanner({ token, actor, month, plan, onSaved }: Props) {
  const [planned, setPlanned] = useState(plan ? String(plan.plannedAmount) : "");
  const [editing, setEditing] = useState(false);

  const overAllocated = plan != null && plan.availableToBudget < 0;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-white">Income plan — {month}</h2>
          {plan ? (
            <p className="mt-1 text-sm text-slate-400">
              Planned ${formatMoney(plan.plannedAmount)} · Envelopes ${formatMoney(plan.allocatedEnvelopes)} ·
              Available ${formatMoney(plan.availableToBudget)}
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-500">No income plan set for this month.</p>
          )}
        </div>
        {actor && (
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className="rounded-lg bg-slate-700 px-3 py-1 text-sm text-white"
          >
            {editing ? "Cancel" : "Edit plan"}
          </button>
        )}
      </div>

      {overAllocated && (
        <div className="mt-3 rounded-lg border border-amber-700/50 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
          Envelope targets exceed planned income by ${formatMoney(Math.abs(plan!.availableToBudget))}. Lower
          envelopes or raise planned income.
        </div>
      )}

      {!overAllocated && plan && plan.availableToBudget > 0 && (
        <div className="mt-3 rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-200">
          ${formatMoney(plan.availableToBudget)} still available to assign to envelopes or savings.
        </div>
      )}

      {editing && actor && (
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await putBudgetIncomePlan(token, actor, { month, plannedAmount: Number(planned) || 0 });
            setEditing(false);
            await onSaved();
          }}
        >
          <label className="flex items-center gap-2 text-sm text-slate-400">
            Planned monthly income $
            <input
              value={planned}
              onChange={(e) => setPlanned(e.target.value)}
              className="w-32 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-slate-100"
            />
          </label>
          <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-sm text-white">
            Save
          </button>
        </form>
      )}
    </section>
  );
}
