import { useEffect, useRef, type RefObject } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import ChartTouchShell from "../../components/ChartTouchShell";
import { formatMoney } from "../../lib/budgetMoney";

export type BudgetPieSlice = {
  key: string;
  label: string;
  total: number;
};

type Props = {
  slices: BudgetPieSlice[];
  colors: (slice: BudgetPieSlice, index: number) => string;
  selectedIndex: number | null;
  onSelectIndex: (index: number | null) => void;
  onOpenInLedger: (index: number) => void;
  chartRef?: RefObject<HTMLDivElement | null>;
};

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return (part / whole) * 100;
}

export default function BudgetPieChart({
  slices,
  colors,
  selectedIndex,
  onSelectIndex,
  onOpenInLedger,
  chartRef,
}: Props) {
  const clickTimerRef = useRef<number | null>(null);
  const lastPieTapRef = useRef<{ index: number; at: number } | null>(null);
  const total = slices.reduce((sum, s) => sum + s.total, 0);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current != null) window.clearTimeout(clickTimerRef.current);
    };
  }, []);

  function clearClickTimer() {
    if (clickTimerRef.current != null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
  }

  function selectSlice(index: number) {
    onSelectIndex(index);
  }

  function openSlice(index: number) {
    clearClickTimer();
    onSelectIndex(index);
    onOpenInLedger(index);
  }

  function handleSliceClick(index: number) {
    const now = Date.now();
    const last = lastPieTapRef.current;
    if (last && last.index === index && now - last.at < 450) {
      lastPieTapRef.current = null;
      openSlice(index);
      return;
    }
    lastPieTapRef.current = { index, at: now };
    clearClickTimer();
    clickTimerRef.current = window.setTimeout(() => {
      selectSlice(index);
      clickTimerRef.current = null;
    }, 220);
  }

  const selected = selectedIndex != null ? slices[selectedIndex] : null;

  return (
    <div className="space-y-3">
      <div ref={chartRef} className="mx-auto h-52 w-full max-w-md sm:h-64 md:h-72">
        <ChartTouchShell className="h-full w-full">
          {({ hideTooltip }) => (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="total"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius="88%"
                  innerRadius={0}
                  paddingAngle={1}
                  onClick={(_, index) => handleSliceClick(index)}
                >
                  {slices.map((slice, i) => (
                    <Cell
                      key={slice.key}
                      fill={colors(slice, i)}
                      stroke="var(--hb-chart-slice-stroke, rgb(15 23 42))"
                      strokeWidth={selectedIndex === i ? 2 : 1}
                      cursor="pointer"
                    />
                  ))}
                </Pie>
                <Tooltip active={hideTooltip ? false : undefined} formatter={(v) => `$${formatMoney(Number(v ?? 0))}`} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartTouchShell>
      </div>

      {selected ? (
        <div className="rounded-lg border border-blue-500/30 bg-blue-950/30 px-3 py-2 text-center">
          <p className="text-sm font-medium text-blue-100">
            {selected.label} · {pct(selected.total, total).toFixed(1)}%
          </p>
          <p className="text-xs text-blue-200/80">${formatMoney(selected.total)}</p>
        </div>
      ) : (
        <p className="text-center text-xs text-slate-500">Tap a slice for details</p>
      )}

      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {slices.map((slice, i) => {
          const active = selectedIndex === i;
          const share = pct(slice.total, total);
          return (
            <li key={slice.key}>
              <button
                type="button"
                onClick={() => handleSliceClick(i)}
                className={`flex w-full min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors ${
                  active
                    ? "border-blue-500/50 bg-blue-950/40 text-blue-100"
                    : "border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-600"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colors(slice, i) }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{slice.label}</span>
                <span className="shrink-0 tabular-nums text-xs text-slate-400">{share.toFixed(0)}%</span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-slate-500">Double-tap a slice or legend row to open it in the Ledger.</p>
    </div>
  );
}
