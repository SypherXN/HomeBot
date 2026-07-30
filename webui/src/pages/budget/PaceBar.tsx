import { MONEY_TEXT } from "../../lib/budgetMoney";

export type PaceState = "under" | "pace" | "warn" | "over" | "none";

/**
 * Pacing compares spent% of the envelope to the % of the month elapsed.
 * within ±5% of time = on pace; ahead of time = under (green, spending slow);
 * behind ≤10% = warn; behind >10% or past 100% = over.
 */
export function paceState(spentPct: number, timePct: number, hasTarget: boolean): PaceState {
  if (!hasTarget) return "none";
  if (spentPct >= 100) return "over";
  const drift = spentPct - timePct;
  if (Math.abs(drift) <= 5) return "pace";
  if (drift < 0) return "under";
  if (drift <= 10) return "warn";
  return "over";
}

export const PACE_META: Record<PaceState, { label: string; bar: string; text: string }> = {
  under: { label: "under pace", bar: "bg-emerald-500", text: "text-emerald-400" },
  pace: { label: "on pace", bar: "bg-sky-500", text: "text-sky-400" },
  warn: { label: "spending ahead", bar: "bg-amber-500", text: "text-amber-400" },
  over: { label: "over pace", bar: "bg-rose-500", text: "text-rose-400" },
  none: { label: "no target", bar: "bg-slate-600", text: "text-slate-500" },
};

type Props = {
  /** 0–100+ spent of target. */
  spentPct: number;
  /** 0–100 of the month elapsed. */
  timePct: number;
  hasTarget: boolean;
  /** Show the day-of-month needle. */
  showNeedle?: boolean;
};

/** YNAB-style pacing bar: spent fill with a day-of-month marker on the track. */
export default function PaceBar({ spentPct, timePct, hasTarget, showNeedle = true }: Props) {
  const state = paceState(spentPct, timePct, hasTarget);
  const meta = PACE_META[state];
  const fill = Math.min(100, Math.max(0, spentPct));
  const needle = Math.min(100, Math.max(0, timePct));

  return (
    <div className="space-y-1">
      <div className="relative">
        <div className="hb-progress-track h-2 overflow-hidden rounded-full">
          <div className={`h-full rounded-full transition-[width] duration-300 ${meta.bar}`} style={{ width: `${fill}%` }} />
        </div>
        {showNeedle && hasTarget && (
          <span
            className="absolute -top-0.5 h-3 w-px bg-slate-400/90"
            style={{ left: `${needle}%` }}
            title={`${needle.toFixed(0)}% of month elapsed`}
            aria-hidden
          />
        )}
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className={`${meta.text} font-medium`}>{hasTarget ? meta.label : meta.label}</span>
        {hasTarget && <span className={`${MONEY_TEXT} text-slate-500`}>{spentPct.toFixed(0)}% used · day {Math.round(timePct)}%</span>}
      </div>
    </div>
  );
}

/** Days-in-month helpers. */
export function monthTimePct(month: string, today: Date = new Date()): number {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return 100;
  const now = new Date();
  const isCurrent = y === now.getFullYear() && m === now.getMonth() + 1;
  const daysInMonth = new Date(y, m, 0).getDate();
  if (!isCurrent) {
    const start = new Date(y, m - 1, 1);
    return today < start ? 0 : 100;
  }
  return Math.min(100, (today.getDate() / daysInMonth) * 100);
}
