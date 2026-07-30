import { formatMoney, formatMonthLong } from "../../lib/budgetMoney";
import type { BudgetIncomePlan, BudgetMonthSummary } from "../../api";

type Props = {
  month: string;
  summary: BudgetMonthSummary | null;
  incomePlan: BudgetIncomePlan | null;
  /** Spent total on envelope-tracked categories this month. */
  envelopeSpent: number;
};

/**
 * The one number people want first: how much is left to budget this month.
 * Positive = unassigned money; negative = envelopes exceed planned income.
 */
export default function BudgetOverviewHero({ month, summary, incomePlan, envelopeSpent }: Props) {
  const available = incomePlan?.availableToBudget ?? null;
  const tone =
    available == null ? "text-white" : available < 0 ? "text-red-300" : available === 0 ? "text-slate-100" : "text-emerald-300";
  const label =
    available == null
      ? "Set an income plan to see what's left to budget"
      : available < 0
        ? "over budget — envelopes exceed planned income"
        : available === 0
          ? "fully budgeted"
          : "left to budget";

  return (
    <section className="hb-card overflow-hidden p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-400">{formatMonthLong(month)}</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className={`font-display text-4xl font-semibold tracking-tight sm:text-5xl ${tone}`}>
            {available == null ? "—" : `${available < 0 ? "−" : ""}$${formatMoney(Math.abs(available))}`}
          </div>
          <p className="mt-1 text-sm text-slate-400">{label}</p>
          {incomePlan ? (
            <p className="mt-2 text-xs text-slate-500">
              Planned ${formatMoney(incomePlan.plannedAmount)} · envelopes ${formatMoney(incomePlan.allocatedEnvelopes)}
              {envelopeSpent > 0 ? ` · spent on envelopes $${formatMoney(envelopeSpent)}` : ""}
            </p>
          ) : null}
        </div>
        {summary && (
          <dl className="grid shrink-0 grid-cols-3 gap-4 text-right sm:gap-6">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">Income</dt>
              <dd className="mt-0.5 text-lg font-semibold text-emerald-400">${formatMoney(summary.totalIncome)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">Spent</dt>
              <dd className="mt-0.5 text-lg font-semibold text-amber-300">${formatMoney(summary.totalExpenses)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">Net</dt>
              <dd className={`mt-0.5 text-lg font-semibold ${summary.net < 0 ? "text-red-300" : "text-white"}`}>
                {summary.net < 0 ? "−" : ""}${formatMoney(Math.abs(summary.net))}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </section>
  );
}
