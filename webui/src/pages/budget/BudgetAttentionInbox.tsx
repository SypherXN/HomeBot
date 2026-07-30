import type { ReactNode } from "react";
import { formatMonthLong } from "../../lib/budgetMoney";

export type AttentionItem = {
  key: string;
  icon?: ReactNode;
  message: string;
  /** Optional inline action (e.g. Dismiss). */
  action?: { label: string; onClick: () => void; busy?: boolean };
};

type Props = {
  month: string;
  items: AttentionItem[];
};

/**
 * "Needs attention" inbox for the month: over-budget envelopes, pace warnings,
 * upcoming bills, uncategorized transactions, and active alerts — in one list.
 */
export default function BudgetAttentionInbox({ month, items }: Props) {
  if (items.length === 0) {
    return (
      <section className="hb-card border-emerald-800/40 p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-950/60 text-emerald-300">✓</span>
          <p className="text-sm text-emerald-200">All clear for {formatMonthLong(month)} — nothing needs attention.</p>
        </div>
      </section>
    );
  }
  return (
    <section className="hb-card border-amber-800/40 p-4">
      <h2 className="mb-3 text-lg font-medium text-white">Needs attention</h2>
      <ul className="space-y-2">
        {items.map((it) => (
          <li
            key={it.key}
            className="flex items-start justify-between gap-3 rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-300"
          >
            <span className="flex min-w-0 items-start gap-2">
              {it.icon ? <span className="mt-0.5 shrink-0">{it.icon}</span> : null}
              <span className="min-w-0 break-words">{it.message}</span>
            </span>
            {it.action ? (
              <button
                type="button"
                disabled={it.action.busy}
                onClick={it.action.onClick}
                className="shrink-0 text-xs text-slate-400 hover:text-white disabled:opacity-50"
              >
                {it.action.busy ? "…" : it.action.label}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
