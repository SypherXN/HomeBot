import { useState } from "react";
import {
  deleteBudgetGoal,
  patchBudgetGoal,
  postBudgetGoal,
  type BudgetCategory,
  type BudgetGoal,
} from "../../api";

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  token: string;
  actor: string;
  categories: BudgetCategory[];
  goals: BudgetGoal[];
  onSaved: () => Promise<void>;
};

export default function BudgetGoalsPanel({ token, actor, categories, goals, onSaved }: Props) {
  const [name, setName] = useState("Emergency fund");
  const [target, setTarget] = useState("1000");
  const [current, setCurrent] = useState("0");
  const [targetDate, setTargetDate] = useState("");
  const [categoryId, setCategoryId] = useState("");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!actor) return;
    await postBudgetGoal(token, actor, {
      name,
      targetAmount: Number(target) || 0,
      currentAmount: Number(current) || 0,
      targetDate: targetDate || undefined,
      categoryId: categoryId ? Number(categoryId) : undefined,
    });
    setName("Emergency fund");
    setTarget("1000");
    setCurrent("0");
    await onSaved();
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h2 className="mb-3 text-lg font-medium text-white">Savings goals</h2>

      {goals.length === 0 ? (
        <p className="mb-4 text-sm text-slate-500">No goals yet.</p>
      ) : (
        <ul className="mb-4 space-y-4">
          {goals.map((g) => (
            <li key={g.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium text-slate-200">{g.name}</span>
                  {g.targetDate && (
                    <span className="ml-2 text-xs text-slate-500">by {g.targetDate}</span>
                  )}
                  {g.categoryId != null && (
                    <span className="ml-2 text-xs text-slate-500">
                      · {categories.find((c) => c.id === g.categoryId)?.name ?? `cat #${g.categoryId}`}
                    </span>
                  )}
                </div>
                <span className="text-sm text-slate-400">
                  ${formatMoney(g.currentAmount)} / ${formatMoney(g.targetAmount)} ({g.percentComplete}%)
                </span>
              </div>
              <div className="mb-2 h-2.5 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-blue-600 transition-all"
                  style={{ width: `${Math.min(100, g.percentComplete)}%` }}
                />
              </div>
              {actor && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="text-xs text-blue-400 hover:underline"
                    onClick={async () => {
                      const v = prompt("Update current amount saved:", String(g.currentAmount));
                      if (v == null) return;
                      await patchBudgetGoal(token, actor, g.id, { currentAmount: Number(v) || 0 });
                      await onSaved();
                    }}
                  >
                    Update progress
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-400 hover:underline"
                    onClick={async () => {
                      if (!confirm(`Delete goal "${g.name}"?`)) return;
                      await deleteBudgetGoal(token, actor, g.id);
                      await onSaved();
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {actor && (
        <form onSubmit={(e) => void handleAdd(e)} className="space-y-2 border-t border-slate-800 pt-4">
          <p className="text-xs text-slate-500">Add goal</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Goal name"
            className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100"
          />
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="Target $"
              className="rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            />
            <input
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="Current $"
              className="rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            />
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            />
          </div>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100"
          >
            <option value="">Linked category (optional)</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-sm text-white">
            Add goal
          </button>
        </form>
      )}
    </section>
  );
}
