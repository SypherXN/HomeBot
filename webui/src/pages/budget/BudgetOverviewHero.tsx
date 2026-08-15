import { MONEY_TEXT, formatMoney, formatMonthLong } from "../../lib/budgetMoney";
import { monthTimePct } from "./budgetPace";
import type { BudgetIncomePlan, BudgetMonthSummary } from "../../api";

type Props = {
  month: string;
  summary: BudgetMonthSummary | null;
  incomePlan: BudgetIncomePlan | null;
  /** Spent total on envelope-tracked categories this month. */
  envelopeSpent: number;
};

function Ring({ pct, tone }: { pct: number; tone: "good" | "warn" | "bad" | "neutral" }) {
  const p = Math.min(100, Math.max(0, pct));
  const stroke = tone === "good" ? "#34d399" : tone === "warn" ? "#fbbf24" : tone === "bad" ? "#fb7185" : "#64748b";
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" className="h-28 w-28 sm:h-32 sm:w-32" role="img" aria-label={`${p.toFixed(0)}% of plan spent`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--hb-progress-track)" strokeWidth="9" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (p / 100) * c}
        transform="rotate(-90 50 50)"
        className="transition-[stroke-dashoffset] duration-500"
      />
      <text x="50" y="47" textAnchor="middle" className="fill-current text-[15px] font-semibold" style={{ fill: stroke }}>
        {p.toFixed(0)}%
      </text>
      <text x="50" y="62" textAnchor="middle" className="fill-slate-500 text-[8px] uppercase tracking-wide" style={{ fill: "var(--hb-ring-sub, #94a3b8)" }}>
        of plan
      </text>
    </svg>
  );
}

/**
 * The one number people want first: how much is left to spend this month —
 * with a pacing ring (spent % vs day %) plus income/spent/net in tabular figures.
 */
export default function BudgetOverviewHero({ month, summary, incomePlan, envelopeSpent }: Props) {
  const planned = incomePlan?.plannedAmount ?? 0;
  const allocated = incomePlan?.allocatedEnvelopes ?? 0;
  const available = incomePlan?.availableToBudget ?? null;

  // Left to *spend* from envelopes: allocated minus what we've spent on them.
  const envelopeRemaining = allocated - envelopeSpent;
  const spentPct = allocated > 0 ? (envelopeSpent / allocated) * 100 : summary ? Math.min(100, summary.totalExpenses / Math.max(1, summary.totalIncome) * 100) : 0;
  const timePct = monthTimePct(month);

  const headValue = allocated > 0 ? envelopeRemaining : available;
  const headTone =
    headValue == null ? "text-white" : headValue < 0 ? "text-rose-400" : spentPct > timePct + 10 ? "text-amber-400" : "text-emerald-400";
  const ringTone = headValue == null ? "neutral" : headValue < 0 ? "bad" : spentPct > timePct + 10 ? "warn" : "good";

  const label =
    allocated > 0
      ? headValue != null && headValue < 0
        ? "over envelope plan"
        : "left to spend (envelopes)"
      : available == null
        ? "Set an income plan to see what's left"
        : available < 0
          ? "over budget — envelopes exceed income"
          : available === 0
            ? "fully budgeted"
            : "left to budget";

  return (
    <section className="hb-card overflow-hidden p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-400">{formatMonthLong(month)}</p>
        <p className="text-[11px] text-slate-500">day {Math.round(timePct)}% through</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-5 sm:gap-8">
        <div className="shrink-0">
          <Ring pct={spentPct} tone={ringTone} />
        </div>

        <div className="min-w-0 flex-1">
          <div className={`font-display ${MONEY_TEXT} text-4xl font-semibold tracking-tight sm:text-5xl ${headTone}`}>
            {headValue == null ? "—" : `${headValue < 0 ? "−" : ""}$${formatMoney(Math.abs(headValue))}`}
          </div>
          <p className="mt-1 text-sm text-slate-400">{label}</p>
          {incomePlan ? (
            <p className={`mt-2 text-xs text-slate-500 ${MONEY_TEXT}`}>
              planned ${formatMoney(planned)} · envelopes ${formatMoney(allocated)} · spent ${formatMoney(envelopeSpent)}
            </p>
          ) : null}
        </div>

        {summary && (
          <dl className="grid shrink-0 grid-cols-3 gap-4 text-right sm:gap-6">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">Income</dt>
              <dd className={`mt-0.5 text-lg font-semibold text-emerald-400 ${MONEY_TEXT}`}>${formatMoney(summary.totalIncome)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">Spent</dt>
              <dd className={`mt-0.5 text-lg font-semibold text-amber-400 ${MONEY_TEXT}`}>${formatMoney(summary.totalExpenses)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">Net</dt>
              <dd className={`mt-0.5 text-lg font-semibold ${MONEY_TEXT} ${summary.net < 0 ? "text-rose-400" : "text-white"}`}>
                {summary.net < 0 ? "−" : ""}${formatMoney(Math.abs(summary.net))}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </section>
  );
}
