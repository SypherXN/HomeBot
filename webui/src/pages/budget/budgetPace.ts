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

/** Share of the calendar month that has elapsed (0–100). */
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
