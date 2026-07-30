import { layerForAssignee } from "../../lib/personLayers";
import { formatMoney } from "../../lib/budgetMoney";
import type { BudgetSummarySlice } from "../../api";

type Props = {
  byUser: BudgetSummarySlice[];
  onPickUser?: (userId: string) => void;
};

/**
 * "Who's spent what" — each person's share of household spending this month.
 * Uses the same per-person colors as the Calendar layers.
 */
export default function BudgetFairnessSnapshot({ byUser, onPickUser }: Props) {
  const spenders = byUser.filter((s) => s.total > 0);
  if (spenders.length < 2) return null;
  const max = Math.max(...spenders.map((s) => s.total));

  return (
    <section className="hb-card p-4">
      <h2 className="mb-3 text-lg font-medium text-white">Who's spent what</h2>
      <ul className="space-y-2.5">
        {spenders.map((s) => {
          const layer = layerForAssignee(s.key);
          const width = max > 0 ? (s.total / max) * 100 : 0;
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => onPickUser?.(s.key)}
                className="block w-full text-left"
                title={onPickUser ? `Show ${s.label}'s transactions` : s.label}
              >
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm text-slate-200">
                    <span className={`h-2.5 w-2.5 rounded-full ${layer.dot}`} aria-hidden />
                    {s.label}
                  </span>
                  <span className="text-xs text-slate-500">
                    ${formatMoney(s.total)} · {s.percent.toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div className={`h-full ${layer.dot}`} style={{ width: `${width}%` }} />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
