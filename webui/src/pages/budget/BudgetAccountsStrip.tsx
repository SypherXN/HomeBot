import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { putBudgetAccountOrder, type BudgetAccount } from "../../api";
import { MONEY_TEXT, formatMoney } from "../../lib/budgetMoney";
import AccountReorderList from "./AccountReorderList";

type Props = {
  accounts: BudgetAccount[];
  onManage: () => void;
  token?: string;
  actor?: string;
  onReordered?: () => Promise<void>;
};

/** Account balances at a glance; credit cards show utilization against their limit. */
export default function BudgetAccountsStrip({ accounts, onManage, token, actor, onReordered }: Props) {
  const active = accounts.filter((a) => a.isActive !== false);
  const [ordered, setOrdered] = useState(active);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOrdered(accounts.filter((a) => a.isActive !== false));
  }, [accounts]);

  if (active.length === 0) return null;

  const cash = ordered
    .filter((a) => a.accountType !== "credit")
    .reduce((sum, a) => sum + a.currentBalance, 0);
  const debt = ordered
    .filter((a) => a.accountType === "credit")
    .reduce((sum, a) => sum + Math.abs(Math.min(0, a.currentBalance)), 0);

  const canReorder = Boolean(token && actor && ordered.length > 1);

  async function persistOrder(next: BudgetAccount[]) {
    if (!token || !actor) return;
    const prev = ordered;
    setOrdered(next);
    setError(null);
    try {
      await putBudgetAccountOrder(token, actor, next.map((a) => a.id));
      await onReordered?.();
    } catch (err) {
      setOrdered(prev);
      setError(err instanceof Error ? err.message : "Couldn't save account order.");
    }
  }

  return (
    <section className="hb-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium text-white">Accounts</h2>
        <div className="flex items-center gap-3">
          <span className={`text-xs text-slate-500 ${MONEY_TEXT}`}>
            Cash ${formatMoney(cash)}
            {debt > 0 ? ` · credit balances $${formatMoney(debt)}` : ""}
          </span>
          <button type="button" onClick={onManage} className="text-xs text-blue-400 hover:text-blue-300">
            Manage
          </button>
        </div>
      </div>
      {canReorder && (
        <p className="mb-2 text-[11px] text-slate-500">Drag the dotted handle to reorder.</p>
      )}
      {error && <p className="mb-2 text-xs text-red-300">{error}</p>}
      <AccountReorderList
        items={ordered}
        enabled={canReorder}
        listClassName="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
        onReorder={(next) => void persistOrder(next)}
        renderItem={(a, handle) => {
          const isCredit = a.accountType === "credit";
          const utilization =
            isCredit && a.creditLimit && a.creditLimit > 0
              ? Math.min(100, (Math.abs(Math.min(0, a.currentBalance)) / a.creditLimit) * 100)
              : null;
          return (
            <div
              className="flex overflow-hidden rounded-lg border border-slate-800 bg-slate-950/50 transition-colors hover:border-slate-700"
              style={a.color ? { borderLeftColor: a.color, borderLeftWidth: 3 } : undefined}
            >
              {handle}
              <Link to={`/budget/accounts/${a.id}`} className="min-w-0 flex-1 px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm text-slate-300">{a.name}</span>
                  <span
                    className={`shrink-0 text-sm font-semibold ${MONEY_TEXT} ${
                      a.currentBalance < 0 ? "text-rose-400" : "text-white"
                    }`}
                  >
                    {a.currentBalance < 0 ? "−" : ""}${formatMoney(Math.abs(a.currentBalance))}
                  </span>
                </div>
                {utilization != null && (
                  <div className="mt-1.5">
                    <div className="hb-progress-track h-1.5 overflow-hidden rounded-full">
                      <div
                        className={`h-full ${utilization >= 80 ? "bg-rose-500" : utilization >= 50 ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${utilization}%` }}
                      />
                    </div>
                    <p className={`mt-1 text-[11px] text-slate-500 ${MONEY_TEXT}`}>
                      {utilization.toFixed(0)}% of ${formatMoney(a.creditLimit!)} limit
                    </p>
                  </div>
                )}
              </Link>
            </div>
          );
        }}
      />
    </section>
  );
}
