import { MONEY_TEXT } from "../../lib/budgetMoney";
import { PACE_META, paceState } from "./budgetPace";

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
