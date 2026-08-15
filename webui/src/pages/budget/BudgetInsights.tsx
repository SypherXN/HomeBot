import { useMemo } from "react";
import type { BudgetEnvelope, BudgetNotificationItem, BudgetTransactionListItem } from "../../api";
import { MONEY_TEXT, formatMoney } from "../../lib/budgetMoney";
import { titleCase } from "../../lib/titleCase";
import PaceBar from "./PaceBar";
import { monthTimePct } from "./budgetPace";

type Props = {
  envelopes: BudgetEnvelope[];
  transactions: BudgetTransactionListItem[];
  notifications: BudgetNotificationItem[];
  month: string;
  onViewCategory?: (categoryId: number) => void;
  onViewMerchant?: (merchant: string) => void;
};

/**
 * Budget vs actual bars, top merchants this month, and short anomaly sentences.
 */
export default function BudgetInsights({
  envelopes,
  transactions,
  notifications,
  month,
  onViewCategory,
  onViewMerchant,
}: Props) {
  const withTargets = envelopes.filter((e) => e.targetAmount > 0);
  const timePct = monthTimePct(month);
  const topMerchants = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      const m = t.merchant?.trim();
      if (!m) continue;
      map.set(m, (map.get(m) ?? 0) + t.amount);
    }
    return [...map.entries()]
      .map(([merchant, total]) => ({ merchant, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [transactions]);

  const anomalies = useMemo(() => {
    const lines: string[] = [];
    for (const e of withTargets) {
      if (e.actualAmount > e.targetAmount) {
        lines.push(
          `${titleCase(e.categoryName)} is $${formatMoney(e.actualAmount - e.targetAmount)} over its $${formatMoney(e.targetAmount)} budget.`
        );
      } else if (e.leaveAmount && e.leaveAmount > 0 && e.remaining < e.leaveAmount) {
        lines.push(
          `${titleCase(e.categoryName)} has $${formatMoney(e.remaining)} left — below your $${formatMoney(e.leaveAmount)} leave-aim.`
        );
      }
    }
    for (const n of notifications.slice(0, 3)) {
      if (!lines.includes(n.message)) lines.push(n.message);
    }
    return lines.slice(0, 5);
  }, [withTargets, notifications]);

  if (withTargets.length === 0 && topMerchants.length === 0 && anomalies.length === 0) {
    return null;
  }

  return (
    <section className="hb-card space-y-5 p-4">
      <h2 className="text-lg font-medium text-white">This month at a glance</h2>

      {withTargets.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Budget vs actual</h3>
          <ul className="space-y-2.5">
            {withTargets.map((e) => (
              <li key={e.categoryId}>
                <button
                  type="button"
                  className="block w-full text-left"
                  onClick={() => onViewCategory?.(e.categoryId)}
                >
                  <div className="mb-1 flex justify-between gap-2 text-sm">
                    <span className="text-slate-200">{titleCase(e.categoryName)}</span>
                    <span className={`text-xs ${MONEY_TEXT} text-slate-500`}>
                      ${formatMoney(e.actualAmount)} / ${formatMoney(e.targetAmount)}
                    </span>
                  </div>
                  <PaceBar spentPct={e.percentUsed} timePct={timePct} hasTarget={e.targetAmount > 0} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {topMerchants.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Top merchants</h3>
          <ul className="space-y-1.5">
            {topMerchants.map((m) => (
              <li key={m.merchant}>
                <button
                  type="button"
                  onClick={() => onViewMerchant?.(m.merchant)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm text-slate-300 hover:bg-slate-800/60"
                >
                  <span className="truncate">{m.merchant}</span>
                  <span className="shrink-0 text-amber-300">${formatMoney(m.total)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {anomalies.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Worth a look</h3>
          <ul className="space-y-1.5">
            {anomalies.map((line, i) => (
              <li key={i} className="rounded-lg border border-amber-800/30 bg-amber-950/20 px-3 py-2 text-sm text-amber-100">
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
