import { Fragment, useMemo } from "react";
import type { BudgetTransactionListItem } from "../../api";
import { formatMoney } from "../../lib/budgetMoney";

type Props = {
  month: string;
  transactions: BudgetTransactionListItem[];
};

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Week-of-month heatmap of expense totals by weekday. */
export default function BudgetWeekHeatmap({ month, transactions }: Props) {
  const { cells, max, weekCount } = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    if (!y || !m) return { cells: [] as number[][], max: 0, weekCount: 0 };

    const first = new Date(y, m - 1, 1);
    const daysInMonth = new Date(y, m, 0).getDate();
    const startDow = (first.getDay() + 6) % 7;
    const weeks = Math.ceil((startDow + daysInMonth) / 7);
    const grid: number[][] = Array.from({ length: weeks }, () => Array(7).fill(0));

    for (const t of transactions) {
      if (t.type !== "expense") continue;
      const day = Number(t.transactionDate?.slice(8, 10));
      if (!day || day < 1 || day > daysInMonth) continue;
      const idx = startDow + day - 1;
      const w = Math.floor(idx / 7);
      const d = idx % 7;
      grid[w][d] += t.amount;
    }

    let maxVal = 0;
    for (const row of grid) for (const v of row) if (v > maxVal) maxVal = v;
    return { cells: grid, max: maxVal, weekCount: weeks };
  }, [month, transactions]);

  if (weekCount === 0) return null;

  return (
    <section className="hb-card p-4">
      <h2 className="mb-1 text-lg font-medium text-white">Spending by day</h2>
      <p className="mb-3 text-xs text-slate-500">Darker = more spent that weekday.</p>
      <div className="overflow-x-auto">
        <div className="inline-grid gap-1" style={{ gridTemplateColumns: `2.5rem repeat(7, 1.75rem)` }}>
          <span />
          {DOW.map((d) => (
            <span key={d} className="text-center text-[10px] text-slate-500">
              {d}
            </span>
          ))}
          {cells.map((row, wi) => (
            <Fragment key={wi}>
              <span className="pr-1 text-right text-[10px] text-slate-500">W{wi + 1}</span>
              {row.map((v, di) => {
                const intensity = max > 0 ? v / max : 0;
                return (
                  <span
                    key={di}
                    title={v > 0 ? `$${formatMoney(v)}` : undefined}
                    className="h-7 w-7 rounded-sm border border-slate-800/80"
                    style={{
                      backgroundColor:
                        v <= 0
                          ? "transparent"
                          : `color-mix(in srgb, var(--hb-heat, #0891b2) ${Math.round(20 + intensity * 80)}%, transparent)`,
                    }}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}
