import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BudgetTrendPoint } from "../../api";
import { useTheme } from "../../theme/ThemeProvider";

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

type Props = {
  trends: BudgetTrendPoint[];
  months?: number;
};

export default function BudgetTrendChart({ trends }: Props) {
  const { theme } = useTheme();
  const { totals, topSeries, topLabels } = useMemo(() => {
    const monthTotals = new Map<string, number>();
    const catByMonth = new Map<string, Map<string, number>>();

    for (const t of trends) {
      monthTotals.set(t.month, (monthTotals.get(t.month) ?? 0) + t.total);
      if (!catByMonth.has(t.label)) catByMonth.set(t.label, new Map());
      const m = catByMonth.get(t.label)!;
      m.set(t.month, (m.get(t.month) ?? 0) + t.total);
    }

    const months = [...monthTotals.keys()].sort();
    const totals = months.map((month) => ({ month, total: monthTotals.get(month) ?? 0 }));

    const topLabels = [...catByMonth.entries()]
      .map(([label, map]) => ({ label, sum: [...map.values()].reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.sum - a.sum)
      .slice(0, 3)
      .map((x) => x.label);

    const topSeries = months.map((month) => {
      const row: Record<string, string | number> = { month };
      for (const label of topLabels) {
        row[label] = catByMonth.get(label)?.get(month) ?? 0;
      }
      return row;
    });

    return { totals, topSeries, topLabels };
  }, [trends]);

  if (totals.length === 0) {
    return <p className="text-sm text-slate-500">No trend data yet.</p>;
  }

  const dark = theme === "dark";
  const gridStroke = dark ? "#202741" : "#e2e8f0";
  const axisStroke = dark ? "#8a94bd" : "#64748b";
  const totalStroke = dark ? "#00f0ff" : "#0891b2";
  const colors = dark ? ["#00f0ff", "#a855f7", "#fbbf24"] : ["#0891b2", "#7c3aed", "#d97706"];

  return (
    <div className="space-y-4">
      <div className="h-56 w-full">
        <p className="mb-1 text-xs text-slate-500">Total expenses by month</p>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={totals}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
            <XAxis dataKey="month" stroke={axisStroke} tick={{ fontSize: 11 }} />
            <YAxis stroke={axisStroke} tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
            <Tooltip formatter={(v) => `$${formatMoney(Number(v ?? 0))}`} />
            <Line type="monotone" dataKey="total" stroke={totalStroke} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {topLabels.length > 0 && (
        <div className="h-56 w-full">
          <p className="mb-1 text-xs text-slate-500">Top categories</p>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={topSeries}>
              <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
              <XAxis dataKey="month" stroke={axisStroke} tick={{ fontSize: 11 }} />
              <YAxis stroke={axisStroke} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `$${formatMoney(Number(v ?? 0))}`} />
              <Legend />
              {topLabels.map((label, i) => (
                <Line
                  key={label}
                  type="monotone"
                  dataKey={label}
                  stroke={colors[i % colors.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
