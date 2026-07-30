import { useMemo, useState } from "react";
import type { BudgetEnvelope, BudgetForecastCategory } from "../../api";
import { formatMoney } from "../../lib/budgetMoney";
import { titleCase } from "../../lib/titleCase";

type Props = {
  forecast: BudgetForecastCategory[];
  envelopes: BudgetEnvelope[];
};

/** "What if" slider: see how cutting a category changes the month-end projection. */
export default function BudgetScenarioPanel({ forecast, envelopes }: Props) {
  const categories = useMemo(() => {
    const names = new Map<number, string>();
    for (const f of forecast) names.set(f.categoryId, f.categoryName);
    for (const e of envelopes) names.set(e.categoryId, e.categoryName);
    return [...names.entries()].map(([id, name]) => ({ id, name }));
  }, [forecast, envelopes]);

  const [categoryId, setCategoryId] = useState<number | "">("");
  const [cutPct, setCutPct] = useState(20);

  const selected = forecast.find((f) => f.categoryId === categoryId) ?? null;
  const envelope = envelopes.find((e) => e.categoryId === categoryId) ?? null;

  const projected = selected?.projectedMonthEnd ?? 0;
  const adjusted = projected * (1 - cutPct / 100);
  const target = envelope?.targetAmount ?? selected?.envelopeTarget ?? 0;
  const delta = adjusted - target;

  if (categories.length === 0 || forecast.length === 0) return null;

  return (
    <section className="hb-card p-4">
      <h2 className="mb-1 text-lg font-medium text-white">What if</h2>
      <p className="mb-3 text-xs text-slate-500">Try a spending cut before you commit to it.</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-slate-400">
          Category
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : "")}
            className="mt-1 w-full hb-input px-3 py-2 text-sm text-slate-100"
          >
            <option value="">Pick a category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-slate-400">
          Cut spending by <strong className="text-white">{cutPct}%</strong>
          <input
            type="range"
            min={5}
            max={80}
            step={5}
            value={cutPct}
            onChange={(e) => setCutPct(Number(e.target.value))}
            className="mt-2 w-full accent-blue-500"
          />
        </label>
      </div>

      {selected && (
        <div className="mt-4 grid gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-4 sm:grid-cols-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">On track now</p>
            <p className="mt-1 text-xl font-semibold text-amber-300">${formatMoney(projected)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">After {cutPct}% cut</p>
            <p className="mt-1 text-xl font-semibold text-emerald-400">${formatMoney(adjusted)}</p>
            <p className="text-xs text-slate-500">saves ${formatMoney(projected - adjusted)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              vs {target > 0 ? `${titleCase(envelope?.categoryName ?? selected.categoryName)} budget` : "budget"}
            </p>
            {target > 0 ? (
              <p className={`mt-1 text-xl font-semibold ${delta > 0 ? "text-red-300" : "text-emerald-400"}`}>
                {delta > 0 ? "$" : "−$"}
                {formatMoney(Math.abs(delta))} {delta > 0 ? "over" : "under"}
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-500">no target set</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
