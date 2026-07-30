import { layerForAssignee } from "../../lib/personLayers";
import { formatMoney, MONEY_TEXT } from "../../lib/budgetMoney";
import type { MoneyBalances } from "../../api";

type Props = {
  balances: MoneyBalances | null;
  loading: boolean;
  error: string | null;
  onSettle: (otherUserId: string, otherLabel: string, amount: number, direction: "they-pay" | "i-pay") => void;
};

/**
 * Splitwise-style balances hero: net position up top, per-person rows with a
 * Settle button that prefills the settle-up sheet.
 */
export default function MoneyBalancesHero({ balances, loading, error, onSettle }: Props) {
  const rows = balances?.balances ?? [];
  const net = rows.reduce((s, b) => s + b.balance, 0);
  const netTone = net > 0 ? "text-emerald-300" : net < 0 ? "text-amber-300" : "text-slate-300";
  const netLabel = net > 0 ? "you're owed" : net < 0 ? "you owe" : "settled up";

  return (
    <section className="hb-card p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Your balances</p>
          <p className={`mt-1 ${MONEY_TEXT} text-3xl font-semibold ${netTone}`}>
            {rows.length === 0 ? "$0.00" : `${net < 0 ? "−" : ""}$${formatMoney(Math.abs(net))}`}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {loading ? "Loading…" : rows.length === 0 ? "all settled up" : `net across ${rows.length} ${rows.length === 1 ? "person" : "people"} — ${netLabel}`}
          </p>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

      {rows.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-950/40">
          {rows.map((b) => {
            const owed = b.balance >= 0;
            const layer = layerForAssignee(String(b.otherUserId));
            return (
              <li key={String(b.otherUserId)} className="flex items-center gap-3 px-3 py-2.5">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${layer.dot}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-100">{b.otherMemberLabel}</p>
                  <p className="text-xs text-slate-500">{owed ? "owes you" : "you owe them"}</p>
                </div>
                <span className={`${MONEY_TEXT} text-sm font-semibold ${owed ? "text-emerald-300" : "text-amber-300"}`}>
                  {owed ? "+" : "−"}${formatMoney(Math.abs(b.balance))}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onSettle(String(b.otherUserId), b.otherMemberLabel, Math.abs(b.balance), owed ? "they-pay" : "i-pay")
                  }
                  className="shrink-0 rounded-lg border border-emerald-800/70 bg-emerald-950/30 px-2.5 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-950/60"
                >
                  Settle
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
