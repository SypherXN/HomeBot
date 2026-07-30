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
  skippedIds: number[];
  month: string;
  onSkip: (billId: number) => Promise<void>;
  onUnskip: (billId: number) => Promise<void>;
  onSaved: () => Promise<void>;
  onToast: (message: string) => void;
  onManageBills: () => void;
};

/** Next bills due, with one-tap Pay (posts an expense for the estimate). */
export default function BudgetUpcomingBills({
  token,
  actor,
  bills,
  skippedIds,
  month,
  onSkip,
  onUnskip,
  onSaved,
  onToast,
  onManageBills,
}: Props) {
  const skippedSet = useMemo(() => new Set(skippedIds), [skippedIds]);
  const upcoming = useMemo(() => upcomingBills(bills), [bills]);
  const [payingId, setPayingId] = useState<number | null>(null);
  const [skipBusyId, setSkipBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = upcoming.filter(({ bill }) => !skippedSet.has(bill.id));
  const skipped = upcoming.filter(({ bill }) => skippedSet.has(bill.id));

  if (upcoming.length === 0) return null;

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

  async function toggleSkip(billId: number, skip: boolean) {
    setSkipBusyId(billId);
    setError(null);
    try {
      if (skip) await onSkip(billId);
      else await onUnskip(billId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSkipBusyId(null);
    }
  }

  function renderRow({ bill, inDays, overdueDays }: UpcomingBill, isSkipped: boolean) {
    return (
      <li
        key={bill.id}
        className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
          isSkipped ? "border-slate-800/50 bg-slate-950/30 opacity-70" : "border-slate-800 bg-slate-950/50"
        }`}
      >
        <div className="min-w-0">
          <span className={`text-sm font-medium ${isSkipped ? "text-slate-400 line-through" : "text-slate-200"}`}>
            {titleCase(bill.name)}
          </span>
          <span className="ml-2 text-sm text-slate-400">~${formatMoney(bill.amountEstimate)}</span>
          <span
            className={`ml-2 text-xs ${overdueDays > 0 ? "text-red-300" : inDays <= 3 ? "text-amber-300" : "text-slate-500"}`}
          >
            {isSkipped
              ? `skipped for ${month}`
              : overdueDays > 0
                ? `was due the ${ordinal(bill.dueDay)}`
                : inDays === 0
                  ? "due today"
                  : inDays === 1
                    ? "due tomorrow"
                    : `due the ${ordinal(bill.dueDay)}`}
          </span>
        </div>
        {actor ? (
          <span className="flex shrink-0 gap-2">
            {isSkipped ? (
              <button
                type="button"
                disabled={skipBusyId === bill.id}
                onClick={() => void toggleSkip(bill.id, false)}
                className="rounded-lg border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                {skipBusyId === bill.id ? "…" : "Unskip"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={skipBusyId === bill.id}
                  onClick={() => void toggleSkip(bill.id, true)}
                  className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-400 hover:bg-slate-800 disabled:opacity-50"
                >
                  {skipBusyId === bill.id ? "…" : "Skip"}
                </button>
                <button
                  type="button"
                  disabled={payingId === bill.id}
                  onClick={() => void pay(bill)}
                  className="rounded-lg border border-emerald-700/60 bg-emerald-950/40 px-3 py-1 text-xs text-emerald-100 hover:bg-emerald-950/70 disabled:opacity-50"
                >
                  {payingId === bill.id ? "Paying…" : `Pay $${formatMoney(bill.amountEstimate)}`}
                </button>
              </>
            )}
          </span>
        ) : null}
      </li>
    );
  }

  return (
    <section className="hb-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium text-white">Upcoming bills</h2>
        <button type="button" onClick={onManageBills} className="text-xs text-blue-400 hover:text-blue-300">
          Manage bills
        </button>
      </div>
      {visible.length > 0 && <ul className="space-y-2">{visible.map((u) => renderRow(u, false))}</ul>}
      {skipped.length > 0 && (
        <div className={visible.length > 0 ? "mt-4" : ""}>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Skipped this month</p>
          <ul className="space-y-2">{skipped.map((u) => renderRow(u, true))}</ul>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
    </section>
  );
}
