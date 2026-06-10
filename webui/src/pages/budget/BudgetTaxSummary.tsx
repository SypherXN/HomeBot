import { useState } from "react";
import { getBudgetTaxSummary, type BudgetTaxSummaryLine } from "../../api";
import { titleCase } from "../../lib/titleCase";

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  token: string;
};

export default function BudgetTaxSummary({ token }: Props) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [lines, setLines] = useState<BudgetTaxSummaryLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const data = await getBudgetTaxSummary(token, year);
      setLines(data);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const total = lines.reduce((s, l) => s + l.total, 0);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h2 className="mb-3 text-lg font-medium text-white">Tax-deductible summary</h2>
      <p className="mb-3 text-xs text-slate-500">
        Totals expenses in categories marked tax-deductible for the selected year.
      </p>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="text-sm text-slate-400">
          Year{" "}
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="ml-1 w-24 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-slate-100"
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white"
        >
          Load
        </button>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {loaded && lines.length === 0 && (
        <p className="text-sm text-slate-500">No tax-tagged spending for {year}.</p>
      )}
      {lines.length > 0 && (
        <>
          <p className="mb-2 text-sm font-medium text-emerald-300">Total: ${formatMoney(total)}</p>
          <ul className="space-y-1 text-sm text-slate-300">
            {lines.map((l) => (
              <li key={l.categoryId} className="flex justify-between">
                <span>{titleCase(l.categoryName)}</span>
                <span>${formatMoney(l.total)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
