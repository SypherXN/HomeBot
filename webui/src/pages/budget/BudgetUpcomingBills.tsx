import { useMemo, useState } from "react";
import { postBudgetBillPay, type BudgetBill } from "../../api";
import { formatMoney, ordinal } from "../../lib/budgetMoney";
import { titleCase } from "../../lib/titleCase";

type UpcomingBill = {
  bill: BudgetBill;
  /** 0 = today, positive = days from now. */
  inDays: number;
  overdueDays: number;
};

function upcomingBills(bills: BudgetBill[], windowDays = 14): UpcomingBill[] {
  const today = new Date();
  const day = today.getDate();
  const dim = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const out: UpcomingBill[] = [];
  for (const bill of bills) {
    if (!bill.isActive) continue;
    const overdueDays = bill.dueDay < day ? day - bill.dueDay : 0;
    let inDays = bill.dueDay - day;
    if (inDays < 0) inDays = dim - day + bill.dueDay; // rolls to next month
    if (overdueDays > 0 && overdueDays > 7) continue; // stale, handled by attention inbox
    if (overdueDays === 0 && inDays > windowDays) continue;
    out.push({ bill, inDays, overdueDays });
  }
  return out.sort((a, b) => a.inDays - b.inDays);
}

type Props = {
  token: string;
  actor: string;
  bills: BudgetBill[];
  onSaved: () => Promise<void>;
  onToast: (message: string) => void;
  onManageBills: () => void;
};

/** Next bills due, with one-tap Pay (posts an expense for the estimate). */
export default function BudgetUpcomingBills({ token, actor, bills, onSaved, onToast, onManageBills }: Props) {
  const upcoming = useMemo(() => upcomingBills(bills), [bills]);
  const [payingId, setPayingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pay(bill: BudgetBill) {
    if (!actor) return;
    setPayingId(bill.id);
    setError(null);
    try {
      await postBudgetBillPay(token, actor, bill.id, {
        amountInput: String(bill.amountEstimate),
        spentByUserId: actor,
      });
      onToast(`Paid ${titleCase(bill.name)} $${formatMoney(bill.amountEstimate)}`);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPayingId(null);
    }
  }

  if (upcoming.length === 0) return null;

  return (
    <section className="hb-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium text-white">Upcoming bills</h2>
        <button type="button" onClick={onManageBills} className="text-xs text-blue-400 hover:text-blue-300">
          Manage bills
        </button>
      </div>
      <ul className="space-y-2">
        {upcoming.map(({ bill, inDays, overdueDays }) => (
          <li
            key={bill.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2"
          >
            <div className="min-w-0">
              <span className="text-sm font-medium text-slate-200">{titleCase(bill.name)}</span>
              <span className="ml-2 text-sm text-slate-400">~${formatMoney(bill.amountEstimate)}</span>
              <span
                className={`ml-2 text-xs ${overdueDays > 0 ? "text-red-300" : inDays <= 3 ? "text-amber-300" : "text-slate-500"}`}
              >
                {overdueDays > 0
                  ? `was due the ${ordinal(bill.dueDay)}`
                  : inDays === 0
                    ? "due today"
                    : inDays === 1
                      ? "due tomorrow"
                      : `due the ${ordinal(bill.dueDay)}`}
              </span>
            </div>
            {actor ? (
              <button
                type="button"
                disabled={payingId === bill.id}
                onClick={() => void pay(bill)}
                className="shrink-0 rounded-lg border border-emerald-700/60 bg-emerald-950/40 px-3 py-1 text-xs text-emerald-100 hover:bg-emerald-950/70 disabled:opacity-50"
              >
                {payingId === bill.id ? "Paying…" : `Pay $${formatMoney(bill.amountEstimate)}`}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
    </section>
  );
}
