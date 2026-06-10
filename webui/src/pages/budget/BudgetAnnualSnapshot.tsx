import { useCallback, useEffect, useState } from "react";
import {
  getBudgetGoals,
  getBudgetSummaryMonth,
  getBudgetTaxSummary,
  getBudgetTrends,
  type BudgetGoal,
  type BudgetTaxSummaryLine,
  type BudgetTrendPoint,
} from "../../api";
import { titleCase } from "../../lib/titleCase";

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  token: string;
  year: number;
};

export default function BudgetAnnualSnapshot({ token, year }: Props) {
  const [taxLines, setTaxLines] = useState<BudgetTaxSummaryLine[]>([]);
  const [goals, setGoals] = useState<BudgetGoal[]>([]);
  const [trends, setTrends] = useState<BudgetTrendPoint[]>([]);
  const [ytdIncome, setYtdIncome] = useState(0);
  const [ytdExpenses, setYtdExpenses] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
      const [tax, g, tr, ...summaries] = await Promise.all([
        getBudgetTaxSummary(token, year),
        getBudgetGoals(token),
        getBudgetTrends(token, 12, "category"),
        ...months.map((m) => getBudgetSummaryMonth(token, m).catch(() => null)),
      ]);
      setTaxLines(tax);
      setGoals(g);
      setTrends(tr);
      let income = 0;
      let expenses = 0;
      for (const s of summaries) {
        if (!s) continue;
        income += s.totalIncome;
        expenses += s.totalExpenses;
      }
      setYtdIncome(income);
      setYtdExpenses(expenses);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const taxTotal = taxLines.reduce((s, l) => s + l.total, 0);

  const trendByMonth = new Map<string, number>();
  for (const t of trends) {
    trendByMonth.set(t.month, (trendByMonth.get(t.month) ?? 0) + t.total);
  }
  const trendMonths = [...trendByMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h2 className="mb-1 text-lg font-medium text-white">Annual snapshot — {year}</h2>
      <p className="mb-4 text-xs text-slate-500">Year-to-date totals, tax-tagged spending, savings goals, and monthly spend trend.</p>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && <p className="text-sm text-red-300">{error}</p>}

      {!loading && !error && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <div className="text-xs text-slate-400">YTD income</div>
              <div className="text-lg font-semibold text-emerald-400">${formatMoney(ytdIncome)}</div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <div className="text-xs text-slate-400">YTD expenses</div>
              <div className="text-lg font-semibold text-amber-300">${formatMoney(ytdExpenses)}</div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <div className="text-xs text-slate-400">YTD net</div>
              <div className="text-lg font-semibold text-white">${formatMoney(ytdIncome - ytdExpenses)}</div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-300">Tax-deductible ({year})</h3>
              {taxLines.length === 0 ? (
                <p className="text-sm text-slate-500">No tax-tagged categories with spending.</p>
              ) : (
                <>
                  <ul className="space-y-1 text-sm text-slate-300">
                    {taxLines.map((l) => (
                      <li key={l.categoryId} className="flex justify-between rounded border border-slate-800 px-2 py-1">
                        <span>{titleCase(l.categoryName)}</span>
                        <span>${formatMoney(l.total)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-slate-400">Total: ${formatMoney(taxTotal)}</p>
                </>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-300">Savings goals</h3>
              {goals.length === 0 ? (
                <p className="text-sm text-slate-500">No goals defined.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {goals.map((g) => (
                    <li key={g.id} className="rounded border border-slate-800 px-2 py-2 text-slate-300">
                      <div className="flex justify-between gap-2">
                        <span>{g.name}</span>
                        <span>
                          ${formatMoney(g.currentAmount)} / ${formatMoney(g.targetAmount)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full bg-blue-600"
                          style={{ width: `${Math.min(100, g.percentComplete)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {trendMonths.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-300">Monthly spending (all categories)</h3>
              <ul className="flex flex-wrap gap-2 text-xs">
                {trendMonths.map(([m, total]) => (
                  <li key={m} className="rounded bg-slate-800 px-2 py-1 text-slate-300">
                    {m}: ${formatMoney(total)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
