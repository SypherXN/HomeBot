import { useMemo } from "react";
import type { BudgetRecurring } from "../../api";
import { formatMoney } from "../../lib/budgetMoney";
import { titleCase } from "../../lib/titleCase";

type Props = {
  recurring: BudgetRecurring[];
};

function advanceDate(iso: string, cadence: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  switch (cadence) {
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "biweekly":
      d.setDate(d.getDate() + 14);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      d.setMonth(d.getMonth() + 1);
      break;
  }
  return d.toISOString().slice(0, 10);
}

function nextRuns(r: BudgetRecurring, count = 3): string[] {
  const out: string[] = [];
  let cur = r.nextRunDate;
  for (let i = 0; i < count; i++) {
    out.push(cur);
    cur = advanceDate(cur, r.cadence);
  }
  return out;
}

function formatShortDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function BudgetRecurringPreview({ recurring }: Props) {
  const active = useMemo(() => recurring.filter((r) => r.isActive), [recurring]);
  if (active.length === 0) return null;

  return (
    <section className="hb-card p-4">
      <h2 className="mb-1 text-lg font-medium text-white">Recurring preview</h2>
      <p className="mb-3 text-xs text-slate-500">Next three run dates for each active recurring item.</p>
      <ul className="space-y-3">
        {active.map((r) => {
          const runs = nextRuns(r);
          const label = r.merchant?.trim() || r.note?.trim() || titleCase(r.type);
          const amt = r.amountInput?.trim() || String(r.amount);
          return (
            <li key={r.id} className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-slate-200">{label}</span>
                <span className="text-xs text-slate-400">
                  ${formatMoney(Number(amt) || r.amount)} · {r.cadence}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {runs.map((d, i) => (
                  <span key={d}>
                    {i > 0 ? " → " : ""}
                    <span className={i === 0 ? "text-cyan-300" : ""}>{formatShortDate(d)}</span>
                  </span>
                ))}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
